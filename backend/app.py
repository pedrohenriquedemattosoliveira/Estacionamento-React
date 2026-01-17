from flask import Flask, request, jsonify
from flask_cors import CORS
import mysql.connector
from mysql.connector import Error
from datetime import datetime
import pytz
import os
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

# ==================== TIMEZONE ====================
tz = pytz.timezone("America/Sao_Paulo")

# ==================== DB CONFIG ====================
DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "user": os.getenv("DB_USER", "root"),
    "password": os.getenv("DB_PASSWORD", ""),
    "database": os.getenv("DB_NAME", "estacionamento"),
    "port": int(os.getenv("DB_PORT", 3306)),
}

# ==================== DB CONNECTION ====================
def get_db_connection():
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute("SET time_zone = '-03:00'")
        cursor.close()
        return conn
    except Error as e:
        print("Erro MySQL:", e)
        return None

def execute_query(query, params=None, fetch=False):
    conn = get_db_connection()
    if not conn:
        return None
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(query, params or ())
        if fetch:
            result = cursor.fetchall()
        else:
            conn.commit()
            result = cursor.lastrowid
        cursor.close()
        conn.close()
        return result
    except Error as e:
        print("Erro query:", e)
        conn.close()
        return None

# ==================== VEÍCULOS ====================
@app.route("/api/veiculos", methods=["GET"])
def listar_veiculos():
    q = """
        SELECT v.*, c.nome AS cliente_nome
        FROM veiculos v
        LEFT JOIN clientes c ON v.cliente_id = c.id
        ORDER BY v.placa
    """
    return jsonify(execute_query(q, fetch=True) or [])

@app.route("/api/veiculos/<int:id>", methods=["PUT"])
def atualizar_veiculo(id):
    d = request.json
    q = """
        UPDATE veiculos
        SET placa=%s, modelo=%s, cor=%s, marca=%s, ano=%s
        WHERE id=%s
    """
    execute_query(q, (
        d["placa"], d["modelo"],
        d.get("cor"), d.get("marca"),
        d.get("ano"), id
    ))
    return jsonify({"mensagem": "Veículo atualizado"})

@app.route("/api/veiculos/<int:id>", methods=["DELETE"])
def deletar_veiculo(id):
    execute_query("DELETE FROM veiculos WHERE id=%s", (id,))
    return jsonify({"mensagem": "Veículo removido"})

# ==================== PERMANÊNCIAS ====================
@app.route("/api/permanencias", methods=["GET"])
def listar_permanencias():
    status = request.args.get("status")
    q = """
        SELECT
            p.id,
            p.veiculo_id,
            p.cliente_id,
            DATE_FORMAT(p.data_entrada, '%Y-%m-%d %H:%i:%s') AS data_entrada,
            DATE_FORMAT(p.data_saida, '%Y-%m-%d %H:%i:%s') AS data_saida,
            p.valor_hora,
            p.status,
            v.placa, v.modelo, v.cor,
            c.nome AS cliente_nome,
            TIMESTAMPDIFF(MINUTE, p.data_entrada,
                COALESCE(p.data_saida, NOW())) AS minutos_decorridos,
            CEIL(
                TIMESTAMPDIFF(MINUTE, p.data_entrada,
                COALESCE(p.data_saida, NOW())) / 60
            ) * p.valor_hora AS valor_atual
        FROM permanencias p
        JOIN veiculos v ON v.id = p.veiculo_id
        LEFT JOIN clientes c ON c.id = p.cliente_id
    """
    if status:
        q += " WHERE p.status=%s"
        return jsonify(execute_query(q, (status,), True) or [])
    return jsonify(execute_query(q, fetch=True) or [])

@app.route("/api/permanencias/entrada", methods=["POST"])
def registrar_entrada():
    d = request.json
    conn = get_db_connection()
    if not conn:
        return jsonify({"erro": "DB offline"}), 500

    try:
        cur = conn.cursor(dictionary=True)
        cur.callproc("sp_registrar_entrada", [
            d["placa"],
            d["modelo"],
            d.get("cor", ""),
            d["cliente"]
        ])
        for r in cur.stored_results():
            res = r.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({
            "mensagem": "Entrada registrada",
            "permanencia_id": res["permanencia_id"]
        }), 201
    except Error as e:
        conn.close()
        return jsonify({"erro": str(e)}), 500

@app.route("/api/permanencias/<int:id>/saida", methods=["PUT"])
def registrar_saida(id):
    conn = get_db_connection()
    if not conn:
        return jsonify({"erro": "DB offline"}), 500
    try:
        cur = conn.cursor(dictionary=True)
        cur.callproc("sp_registrar_saida", [id])
        for r in cur.stored_results():
            dados = r.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({
            "mensagem": "Saída registrada",
            "dados": dados
        })
    except Error as e:
        conn.close()
        return jsonify({"erro": str(e)}), 500

@app.route("/api/permanencias/<int:id>", methods=["DELETE"])
def deletar_permanencia(id):
    execute_query("DELETE FROM permanencias WHERE id=%s", (id,))
    return jsonify({"mensagem": "Permanência excluída"})

# ==================== ENCERRAR DIA ====================
@app.route("/api/permanencias/encerrar-dia", methods=["POST"])
def encerrar_dia():
    try:
        # Deleta todas as permanências do dia atual
        q = """
            DELETE FROM permanencias 
            WHERE DATE(data_entrada) = CURDATE()
        """
        execute_query(q)
        return jsonify({"mensagem": "Dia encerrado com sucesso"})
    except Error as e:
        return jsonify({"erro": str(e)}), 500

# ==================== RELATÓRIOS ====================
@app.route("/api/relatorios/vagas")
def relatorio_vagas():
    ocupadas = execute_query(
        "SELECT COUNT(*) ocupadas FROM permanencias WHERE status='ativo'",
        fetch=True
    )
    total = execute_query(
        "SELECT valor FROM configuracoes WHERE chave='total_vagas'",
        fetch=True
    )
    total_vagas = int(total[0]["valor"]) if total else 50
    usadas = ocupadas[0]["ocupadas"] if ocupadas else 0
    return jsonify({
        "vagas_ocupadas": usadas,
        "vagas_disponiveis": total_vagas - usadas,
        "total_vagas": total_vagas,
        "percentual_ocupacao": round((usadas / total_vagas) * 100, 2)
    })

@app.route("/api/relatorios/financeiro")
def relatorio_financeiro():
    return jsonify(execute_query(
        "SELECT * FROM v_relatorio_financeiro",
        fetch=True
    ) or [])

# ==================== HEALTH ====================
@app.route("/api/health")
def health():
    c = get_db_connection()
    if c:
        c.close()
        return jsonify({"status": "ok"})
    return jsonify({"status": "error"}), 500

# ==================== START ====================
if __name__ == "__main__":
    print("API Estacionamento rodando 🚗")
    app.run(debug=True, host="0.0.0.0", port=5000)