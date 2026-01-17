-- Criar banco de dados
CREATE DATABASE IF NOT EXISTS estacionamento;
USE estacionamento;

-- Tabela de clientes
CREATE TABLE clientes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    telefone VARCHAR(20),
    cpf VARCHAR(14) UNIQUE,
    email VARCHAR(100),
    data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_nome (nome),
    INDEX idx_cpf (cpf)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tabela de veículos
CREATE TABLE veiculos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    placa VARCHAR(10) NOT NULL UNIQUE,
    modelo VARCHAR(50) NOT NULL,
    cor VARCHAR(30),
    marca VARCHAR(30),
    ano INT,
    cliente_id INT,
    data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL,
    INDEX idx_placa (placa),
    INDEX idx_cliente (cliente_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tabela de permanências (registro de entrada/saída)
CREATE TABLE permanencias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    veiculo_id INT NOT NULL,
    cliente_id INT,
    data_entrada DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_saida DATETIME NULL,
    valor_hora DECIMAL(10, 2) DEFAULT 5.00,
    valor_total DECIMAL(10, 2),
    tempo_minutos INT,
    observacoes TEXT,
    status ENUM('ativo', 'finalizado', 'cancelado') DEFAULT 'ativo',
    FOREIGN KEY (veiculo_id) REFERENCES veiculos(id) ON DELETE CASCADE,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL,
    INDEX idx_status (status),
    INDEX idx_data_entrada (data_entrada),
    INDEX idx_veiculo (veiculo_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tabela de configurações do estacionamento
CREATE TABLE configuracoes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    chave VARCHAR(50) NOT NULL UNIQUE,
    valor VARCHAR(255) NOT NULL,
    descricao TEXT,
    data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Inserir configurações padrão
INSERT INTO configuracoes (chave, valor, descricao) VALUES
('valor_hora', '5.00', 'Valor cobrado por hora de estacionamento'),
('total_vagas', '50', 'Número total de vagas do estacionamento'),
('horario_abertura', '06:00', 'Horário de abertura'),
('horario_fechamento', '22:00', 'Horário de fechamento');

-- Trigger para calcular valor total ao registrar saída
DELIMITER //
CREATE TRIGGER calcular_valor_saida
BEFORE UPDATE ON permanencias
FOR EACH ROW
BEGIN
    IF NEW.data_saida IS NOT NULL AND OLD.data_saida IS NULL THEN
        SET NEW.tempo_minutos = TIMESTAMPDIFF(MINUTE, NEW.data_entrada, NEW.data_saida);
        SET NEW.valor_total = CEIL(NEW.tempo_minutos / 60.0) * NEW.valor_hora;
        SET NEW.status = 'finalizado';
    END IF;
END;//
DELIMITER ;

-- View para relatório de permanências ativas
CREATE VIEW v_permanencias_ativas AS
SELECT 
    p.id,
    p.data_entrada,
    v.placa,
    v.modelo,
    v.cor,
    c.nome AS cliente,
    c.telefone,
    TIMESTAMPDIFF(MINUTE, p.data_entrada, NOW()) AS minutos_decorridos,
    CEIL(TIMESTAMPDIFF(MINUTE, p.data_entrada, NOW()) / 60.0) * p.valor_hora AS valor_atual
FROM permanencias p
INNER JOIN veiculos v ON p.veiculo_id = v.id
LEFT JOIN clientes c ON p.cliente_id = c.id
WHERE p.status = 'ativo';

-- View para relatório financeiro
CREATE VIEW v_relatorio_financeiro AS
SELECT 
    DATE(p.data_entrada) AS data,
    COUNT(*) AS total_veiculos,
    SUM(p.valor_total) AS faturamento_total,
    AVG(p.tempo_minutos) AS tempo_medio_minutos,
    AVG(p.valor_total) AS ticket_medio
FROM permanencias p
WHERE p.status = 'finalizado'
GROUP BY DATE(p.data_entrada)
ORDER BY data DESC;

-- Inserir dados de exemplo
INSERT INTO clientes (nome, telefone, cpf, email) VALUES
('João Silva', '(11) 98765-4321', '123.456.789-00', 'joao@email.com'),
('Maria Santos', '(11) 97654-3210', '987.654.321-00', 'maria@email.com'),
('Carlos Oliveira', '(11) 96543-2109', '456.789.123-00', 'carlos@email.com');

INSERT INTO veiculos (placa, modelo, cor, marca, ano, cliente_id) VALUES
('ABC-1234', 'Civic', 'Prata', 'Honda', 2020, 1),
('DEF-5678', 'Gol', 'Branco', 'Volkswagen', 2019, 2),
('GHI-9012', 'Onix', 'Preto', 'Chevrolet', 2021, 3);

-- Inserir algumas permanências de exemplo
INSERT INTO permanencias (veiculo_id, cliente_id, data_entrada, valor_hora) VALUES
(1, 1, NOW() - INTERVAL 2 HOUR, 5.00),
(2, 2, NOW() - INTERVAL 4 HOUR, 5.00);

-- Procedure para registrar entrada
DELIMITER //
CREATE PROCEDURE sp_registrar_entrada(
    IN p_placa VARCHAR(10),
    IN p_modelo VARCHAR(50),
    IN p_cor VARCHAR(30),
    IN p_cliente_nome VARCHAR(100)
)
BEGIN
    DECLARE v_veiculo_id INT;
    DECLARE v_cliente_id INT;
    
    -- Verificar ou criar cliente
    SELECT id INTO v_cliente_id FROM clientes WHERE nome = p_cliente_nome LIMIT 1;
    IF v_cliente_id IS NULL THEN
        INSERT INTO clientes (nome) VALUES (p_cliente_nome);
        SET v_cliente_id = LAST_INSERT_ID();
    END IF;
    
    -- Verificar ou criar veículo
    SELECT id INTO v_veiculo_id FROM veiculos WHERE placa = p_placa LIMIT 1;
    IF v_veiculo_id IS NULL THEN
        INSERT INTO veiculos (placa, modelo, cor, cliente_id) 
        VALUES (p_placa, p_modelo, p_cor, v_cliente_id);
        SET v_veiculo_id = LAST_INSERT_ID();
    END IF;
    
    -- Registrar entrada
    INSERT INTO permanencias (veiculo_id, cliente_id) 
    VALUES (v_veiculo_id, v_cliente_id);
    
    SELECT LAST_INSERT_ID() AS permanencia_id;
END;//
DELIMITER ;

-- Procedure para registrar saída
DELIMITER //
CREATE PROCEDURE sp_registrar_saida(
    IN p_permanencia_id INT
)
BEGIN
    UPDATE permanencias 
    SET data_saida = NOW()
    WHERE id = p_permanencia_id AND status = 'ativo';
    
    SELECT 
        p.id,
        p.tempo_minutos,
        p.valor_total,
        v.placa,
        v.modelo,
        c.nome AS cliente
    FROM permanencias p
    INNER JOIN veiculos v ON p.veiculo_id = v.id
    LEFT JOIN clientes c ON p.cliente_id = c.id
    WHERE p.id = p_permanencia_id;
END;//
DELIMITER ;

-- Consultas úteis
-- Listar vagas ocupadas
-- SELECT COUNT(*) AS vagas_ocupadas FROM permanencias WHERE status = 'ativo';

-- Buscar veículo ativo por placa
-- SELECT * FROM v_permanencias_ativas WHERE placa LIKE '%ABC%';

-- Relatório do dia
-- SELECT * FROM v_relatorio_financeiro WHERE data = CURDATE();