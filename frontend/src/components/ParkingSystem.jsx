import React, { useEffect, useRef, useState } from "react";
import {
  Car,
  PlusCircle,
  Clock,
  Trash2,
  Search,
  XCircle
} from "lucide-react";

const API_URL = "http://localhost:5000/api";

export default function ParkingSystem() {
  /* =====================
     STATES
  ======================*/
  const [permanencias, setPermanencias] = useState([]);
  const [search, setSearch] = useState("");

  const [form, setForm] = useState({
    placa: "",
    modelo: "",
    cor: "",
    cliente: ""
  });

  const [loading, setLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [vagas, setVagas] = useState({
    vagas_ocupadas: 0,
    vagas_disponiveis: 0
  });

  const [stats, setStats] = useState({
    faturamentoDia: 0,
    tempoMedio: 0
  });

  const fetching = useRef(false);

  /* =====================
     HELPERS
  ======================*/
  const money = (v = 0) => `R$ ${(Number(v) || 0).toFixed(2)}`;
  const time = (m = 0) => `${Math.floor(m / 60)}h ${m % 60}min`;
  const date = d => {
    if (!d) return '-';
    // Interpreta a data como horário local de São Paulo
    const [datePart, timePart] = d.split(' ');
    const [year, month, day] = datePart.split('-');
    const [hour, minute, second] = timePart.split(':');
    const localDate = new Date(year, month - 1, day, hour, minute, second);
    return localDate.toLocaleString("pt-BR");
  };

  /* =====================
     LOADERS
  ======================*/
  const reload = async () => {
    if (fetching.current) return;
    fetching.current = true;

    try {
      const [p, v, f] = await Promise.all([
        fetch(`${API_URL}/permanencias`).then(r => r.json()),
        fetch(`${API_URL}/relatorios/vagas`).then(r => r.json()),
        fetch(`${API_URL}/relatorios/financeiro`).then(r => r.json())
      ]);

      setPermanencias(Array.isArray(p) ? p : []);
      setVagas(v || {});
      if (Array.isArray(f) && f.length) {
        setStats({
          faturamentoDia: f[0].faturamento_total ?? 0,
          tempoMedio: f[0].tempo_medio_minutos ?? 0
        });
      }
    } catch (e) {
      console.error(e);
    }

    fetching.current = false;
  };

  useEffect(() => {
    reload();
  }, []);

  /* =====================
     ACTIONS
  ======================*/
  const entradaVeiculo = async () => {
    if (!form.placa || !form.modelo || !form.cliente) {
      setError("Preencha placa, modelo e cliente");
      return;
    }

    try {
      setLoading(true);
      await fetch(`${API_URL}/permanencias/entrada`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });

      setSuccess("Entrada registrada com sucesso");
      setForm({ placa: "", modelo: "", cor: "", cliente: "" });
      reload();
    } catch {
      setError("Erro ao registrar entrada");
    } finally {
      setLoading(false);
    }
  };

  const saidaVeiculo = async (id) => {
    if (!window.confirm("Confirmar saída do veículo?")) return;

    try {
      setCheckoutLoading(id);
      await fetch(`${API_URL}/permanencias/${id}/saida`, { method: "PUT" });
      setSuccess("Saída registrada");
      reload();
    } catch {
      setError("Erro ao registrar saída");
    } finally {
      setCheckoutLoading(null);
    }
  };

  const excluir = async (id) => {
    if (!window.confirm("Excluir registro?")) return;
    await fetch(`${API_URL}/permanencias/${id}`, { method: "DELETE" });
    reload();
  };

  const encerrarDia = async () => {
    if (!window.confirm("⚠️ ATENÇÃO! Isso irá apagar TODOS os veículos do dia. Deseja continuar?")) return;
    
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/permanencias/encerrar-dia`, {
        method: "POST"
      });
      
      if (response.ok) {
        setSuccess("Dia encerrado com sucesso!");
        reload();
      } else {
        setError("Erro ao encerrar o dia");
      }
    } catch {
      setError("Erro ao encerrar o dia");
    } finally {
      setLoading(false);
    }
  };

  /* =====================
     FILTER
  ======================*/
  const lista = permanencias.filter(p =>
    `${p.placa} ${p.modelo} ${p.cliente_nome}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  /* =====================
     UI
  ======================*/
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white p-6">
      <div className="max-w-7xl mx-auto">

        {/* HEADER */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Car size={42} />
            <h1 className="text-4xl font-bold">Sistema de Estacionamento</h1>
          </div>
          <button
            onClick={encerrarDia}
            disabled={loading}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 px-4 py-2 rounded disabled:opacity-50"
          >
            <XCircle size={18} />
            Encerrar Dia
          </button>
        </div>

        {/* CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card title="Vagas Ocupadas" value={vagas.vagas_ocupadas} />
          <Card title="Vagas Livres" value={vagas.vagas_disponiveis} />
          <Card title="Faturamento Hoje" value={money(stats.faturamentoDia)} />
          <Card title="Tempo Médio" value={time(stats.tempoMedio)} />
        </div>

        {/* FORM */}
        <div className="bg-slate-800 rounded-xl p-6 mb-8">
          <h2 className="text-xl font-bold mb-4">Entrada de Veículo</h2>
          <div className="grid md:grid-cols-4 gap-4">
            <input placeholder="Placa" value={form.placa}
              onChange={e => setForm({ ...form, placa: e.target.value })}
              className="p-2 rounded bg-slate-700" />
            <input placeholder="Modelo" value={form.modelo}
              onChange={e => setForm({ ...form, modelo: e.target.value })}
              className="p-2 rounded bg-slate-700" />
            <input placeholder="Cor" value={form.cor}
              onChange={e => setForm({ ...form, cor: e.target.value })}
              className="p-2 rounded bg-slate-700" />
            <input placeholder="Cliente" value={form.cliente}
              onChange={e => setForm({ ...form, cliente: e.target.value })}
              className="p-2 rounded bg-slate-700" />
          </div>

          <button
            onClick={entradaVeiculo}
            disabled={loading}
            className="mt-4 flex items-center gap-2 bg-green-600 hover:bg-green-700 px-4 py-2 rounded"
          >
            <PlusCircle size={18} />
            Registrar Entrada
          </button>
        </div>

        {/* LISTA */}
        <div className="bg-slate-800 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Search size={18} />
            <input
              placeholder="Buscar veículo..."
              className="flex-1 p-2 rounded bg-slate-700"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400">
                <th>Placa</th>
                <th>Modelo</th>
                <th>Cliente</th>
                <th>Entrada</th>
                <th>Valor</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {lista.map(p => (
                <tr key={p.id} className="border-t border-slate-700">
                  <td>{p.placa}</td>
                  <td>{p.modelo}</td>
                  <td>{p.cliente_nome}</td>
                  <td>{date(p.data_entrada)}</td>
                  <td>{money(p.valor_atual)}</td>
                  <td className="flex gap-2 py-2">
                    {p.status === "ativo" && (
                      <button onClick={() => saidaVeiculo(p.id)}>
                        <Clock size={16} />
                      </button>
                    )}
                    <button onClick={() => excluir(p.id)}>
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {!lista.length && (
                <tr>
                  <td colSpan="6" className="text-center py-6 text-slate-400">
                    Nenhum veículo no momento
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {success && <div className="bg-green-600 p-3 rounded mt-4">{success}</div>}
        {error && <div className="bg-red-600 p-3 rounded mt-4">{error}</div>}
      </div>
    </div>
  );
}

/* =====================
   CARD
======================*/
function Card({ title, value }) {
  return (
    <div className="bg-slate-800 rounded-xl p-4">
      <p className="text-slate-400">{title}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}