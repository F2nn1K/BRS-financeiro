const SHEET_CSV_URL = location.hostname === 'localhost' ? '/api/dados' : '/.netlify/functions/dados';
const REFRESH_INTERVAL = 30000;

const COLORS = {
    blue: ['#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#1d4ed8', '#2563eb', '#1e40af'],
    multi: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1'],
};

let charts = {};

var COL_MAP = {};

var COL_KEYWORDS = {
    idade: 'faixa de idade',
    tempo: 'quanto tempo',
    conta: 'conta em banco',
    poupanca: 'guardar algum dinheiro',
    dificuldade: 'dificuldade para conseguir',
    emergencia: 'precisasse de dinheiro',
    interesse: 'empresa oferecesse',
    finalidade: 'finalidade',
    valor: 'valor de empr',
    prazo: 'prazo de pagamento',
    beneficio: 'beneficio financeiro',
    futuro: 'novos benef',
    contato: 'nome ou telefone',
    atual: 'possui algum cr',
};

function buildColMap(headers) {
    COL_MAP = {};
    var normalized = headers.map(function(h) {
        return h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    });
    Object.keys(COL_KEYWORDS).forEach(function(key) {
        var kw = COL_KEYWORDS[key].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        for (var i = 0; i < normalized.length; i++) {
            if (normalized[i].indexOf(kw) !== -1) {
                COL_MAP[key] = headers[i];
                break;
            }
        }
    });
}

function findCol(row, colKey) {
    var header = COL_MAP[colKey];
    if (!header) return '';
    return row[header] || '';
}

function countByCol(data, colKey) {
    var counts = {};
    data.forEach(function(row) {
        var val = findCol(row, colKey);
        if (val && val.trim()) {
            counts[val] = (counts[val] || 0) + 1;
        }
    });
    return counts;
}

// --- CSV Parser ---

function parseCSV(text) {
    const lines = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === '"') {
            inQuotes = !inQuotes;
            current += ch;
        } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
            if (ch === '\r' && text[i + 1] === '\n') i++;
            if (current.trim()) lines.push(current);
            current = '';
        } else {
            current += ch;
        }
    }
    if (current.trim()) lines.push(current);

    var headers = parseCSVLine(lines[0]);
    var trimmedHeaders = headers.map(function(h) { return h.trim(); });
    buildColMap(trimmedHeaders);
    var data = [];
    for (var i = 1; i < lines.length; i++) {
        var vals = parseCSVLine(lines[i]);
        if (vals.length >= 2) {
            var row = {};
            headers.forEach(function(h, idx) { row[h.trim()] = (vals[idx] || '').trim(); });
            data.push(row);
        }
    }
    return data;
}

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += ch;
        }
    }
    result.push(current);
    return result;
}

// --- Helpers ---

function countValues(data, key) {
    const counts = {};
    data.forEach(row => {
        const val = row[key];
        if (val && val.trim()) {
            counts[val] = (counts[val] || 0) + 1;
        }
    });
    return counts;
}

function sortedEntries(counts, customOrder) {
    if (customOrder) {
        const entries = [];
        customOrder.forEach(key => {
            if (counts[key]) entries.push([key, counts[key]]);
        });
        Object.keys(counts).forEach(key => {
            if (!customOrder.includes(key)) entries.push([key, counts[key]]);
        });
        return entries;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

function pct(part, total) {
    return total > 0 ? Math.round((part / total) * 100) : 0;
}

// --- Chart Builders ---

function chartDefaults() {
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.font.size = 11;
    Chart.defaults.plugins.legend.labels.padding = 12;
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.pointStyle = 'circle';
}

function makeBarChart(canvasId, labels, values, colors, horizontal) {
    const ctx = document.getElementById(canvasId);
    if (charts[canvasId]) charts[canvasId].destroy();
    charts[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: colors || COLORS.blue,
                borderRadius: 6,
                borderSkipped: false,
                maxBarThickness: 44,
            }]
        },
        options: {
            indexAxis: horizontal ? 'y' : 'x',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1e293b',
                    titleColor: '#f1f5f9',
                    bodyColor: '#94a3b8',
                    borderColor: '#334155',
                    borderWidth: 1,
                    cornerRadius: 8,
                    padding: 10,
                    callbacks: {
                        label: function(ctx) { return ctx.parsed[horizontal ? 'x' : 'y'] + ' respostas'; }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: horizontal ? 'rgba(51,65,85,0.3)' : 'transparent', drawBorder: false },
                    ticks: { maxRotation: 45, font: { size: 10 } }
                },
                y: {
                    grid: { color: horizontal ? 'transparent' : 'rgba(51,65,85,0.3)', drawBorder: false },
                    ticks: { font: { size: 10 } }
                }
            }
        }
    });
}

function makeDoughnutChart(canvasId, labels, values, colors) {
    const ctx = document.getElementById(canvasId);
    if (charts[canvasId]) charts[canvasId].destroy();
    charts[canvasId] = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: colors || COLORS.multi,
                borderColor: 'transparent',
                borderWidth: 2,
                hoverOffset: 6,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '55%',
            plugins: {
                legend: {
                    position: 'right',
                    labels: { font: { size: 10 }, padding: 8, boxWidth: 12 }
                },
                tooltip: {
                    backgroundColor: '#1e293b',
                    titleColor: '#f1f5f9',
                    bodyColor: '#94a3b8',
                    borderColor: '#334155',
                    borderWidth: 1,
                    cornerRadius: 8,
                    padding: 10,
                    callbacks: {
                        label: function(ctx) {
                            var total = ctx.dataset.data.reduce(function(a, b) { return a + b; }, 0);
                            var p = Math.round((ctx.parsed / total) * 100);
                            return ' ' + ctx.label + ': ' + ctx.parsed + ' (' + p + '%)';
                        }
                    }
                }
            }
        }
    });
}

// --- Dashboard Update ---

function updateDashboard(data) {
    var total = data.length;

    document.getElementById('kpiTotal').textContent = total;
    document.getElementById('kpiTotalSub').textContent = 'colaboradores responderam';

    var interesseCount = data.filter(function(r) {
        return findCol(r, 'interesse') && findCol(r, 'interesse').indexOf('com certeza') !== -1;
    }).length;
    document.getElementById('kpiInteresse').textContent = pct(interesseCount, total) + '%';
    document.getElementById('kpiInteresseSub').textContent = interesseCount + ' de ' + total + ' colaboradores';

    var dificCount = data.filter(function(r) {
        var v = findCol(r, 'dificuldade');
        return v === 'Sim';
    }).length;
    document.getElementById('kpiDificuldade').textContent = pct(dificCount, total) + '%';
    document.getElementById('kpiDificuldadeSub').textContent = dificCount + ' colaboradores';

    var emergCount = data.filter(function(r) {
        return findCol(r, 'emergencia') && findCol(r, 'emergencia').indexOf('conseguiria') !== -1 && findCol(r, 'emergencia').substring(0,3) !== 'Sim';
    }).length;
    document.getElementById('kpiEmergencia').textContent = pct(emergCount, total) + '%';
    document.getElementById('kpiEmergenciaSub').textContent = emergCount + ' colaboradores';

    var empAtual = data.filter(function(r) {
        var v = findCol(r, 'atual');
        return v && v.indexOf('nenhum') === -1 && v.trim() !== '';
    }).length;
    document.getElementById('kpiEmprestimo').textContent = pct(empAtual, total) + '%';
    document.getElementById('kpiEmprestimoSub').textContent = empAtual + ' colaboradores';

    // Faixa etária
    var idadeData = sortedEntries(countByCol(data, 'idade'));
    makeBarChart('chartIdade', idadeData.map(function(e) { return e[0]; }), idadeData.map(function(e) { return e[1]; }),
        ['#3b82f6', '#60a5fa', '#2563eb', '#1d4ed8', '#93c5fd']);

    // Tempo de empresa
    var tempoData = sortedEntries(countByCol(data, 'tempo'));
    makeBarChart('chartTempo',
        tempoData.map(function(e) { return e[0].replace('Entre ', '').replace('Menos de ', '<'); }),
        tempoData.map(function(e) { return e[1]; }),
        ['#10b981', '#34d399', '#059669', '#047857', '#6ee7b7']);

    // Conta bancária
    var contaData = sortedEntries(countByCol(data, 'conta'));
    makeDoughnutChart('chartConta', contaData.map(function(e) { return e[0]; }), contaData.map(function(e) { return e[1]; }),
        ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b']);

    // Poupança
    var poupData = sortedEntries(countByCol(data, 'poupanca'));
    makeDoughnutChart('chartPoupanca', poupData.map(function(e) { return e[0]; }), poupData.map(function(e) { return e[1]; }),
        ['#10b981', '#f59e0b', '#f97316', '#ef4444']);

    // Emergência
    var emergData = sortedEntries(countByCol(data, 'emergencia'));
    makeDoughnutChart('chartEmergencia', emergData.map(function(e) { return e[0]; }), emergData.map(function(e) { return e[1]; }),
        ['#ef4444', '#f59e0b', '#10b981']);

    // Dificuldade crédito
    var dificData = sortedEntries(countByCol(data, 'dificuldade'));
    makeDoughnutChart('chartDificuldade', dificData.map(function(e) { return e[0]; }), dificData.map(function(e) { return e[1]; }),
        ['#ef4444', '#10b981', '#64748b']);

    // Interesse
    var interesseData = sortedEntries(countByCol(data, 'interesse'));
    makeDoughnutChart('chartInteresse', interesseData.map(function(e) { return e[0]; }), interesseData.map(function(e) { return e[1]; }),
        ['#10b981', '#f59e0b', '#ef4444']);

    // Finalidade
    var finalData = sortedEntries(countByCol(data, 'finalidade'));
    makeBarChart('chartFinalidade', finalData.map(function(e) { return e[0]; }), finalData.map(function(e) { return e[1]; }),
        COLORS.multi, true);

    // Valor
    var valorCounts = countByCol(data, 'valor');
    if (valorCounts['Até R$1.000']) {
        valorCounts['Até R$ 1.000'] = (valorCounts['Até R$ 1.000'] || 0) + valorCounts['Até R$1.000'];
        delete valorCounts['Até R$1.000'];
    }
    var valorData = sortedEntries(valorCounts);
    makeBarChart('chartValor', valorData.map(function(e) { return e[0]; }), valorData.map(function(e) { return e[1]; }),
        ['#06b6d4', '#3b82f6', '#8b5cf6', '#a855f7', '#ec4899']);

    // Prazo
    var prazoData = sortedEntries(countByCol(data, 'prazo'));
    makeDoughnutChart('chartPrazo', prazoData.map(function(e) { return e[0]; }), prazoData.map(function(e) { return e[1]; }),
        ['#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899']);

    // Benefício
    var benefData = sortedEntries(countByCol(data, 'beneficio'));
    makeBarChart('chartBeneficio', benefData.map(function(e) { return e[0]; }), benefData.map(function(e) { return e[1]; }),
        COLORS.multi, true);

    // Empréstimo atual
    var atualData = sortedEntries(countByCol(data, 'atual'));
    makeDoughnutChart('chartAtual', atualData.map(function(e) { return e[0]; }), atualData.map(function(e) { return e[1]; }),
        ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899']);

    // Interesse futuro
    var futuroData = sortedEntries(countByCol(data, 'futuro'));
    makeDoughnutChart('chartFuturo', futuroData.map(function(e) { return e[0]; }), futuroData.map(function(e) { return e[1]; }),
        ['#10b981', '#f59e0b', '#ef4444']);

    var now = new Date();
    document.getElementById('lastUpdate').textContent = 'Atualizado: ' + now.toLocaleTimeString('pt-BR');
}

// --- Data Fetching (with CORS fallback) ---

async function fetchData() {
    try {
        var response = await fetch(SHEET_CSV_URL + '?t=' + Date.now());
        var text = await response.text();
        var data = parseCSV(text);
        if (data.length > 0) {
            lastData = data;
            updateDashboard(data);
            document.getElementById('loadingOverlay').classList.add('hidden');
            document.getElementById('btnExport').disabled = false;
        }
    } catch (err) {
        console.error('Erro ao buscar dados:', err);
        document.getElementById('lastUpdate').textContent = 'Erro ao atualizar - tentando novamente...';
    }
}

// --- Excel Export ---

var lastData = null;

var FRIENDLY_HEADERS = {
    idade: 'Faixa de Idade',
    tempo: 'Tempo de Empresa',
    conta: 'Conta em Banco',
    poupanca: 'Hábito de Poupança',
    dificuldade: 'Dificuldade com Crédito',
    emergencia: 'Reserva de Emergência',
    interesse: 'Interesse no Crédito',
    finalidade: 'Finalidade do Crédito',
    valor: 'Valor Desejado',
    prazo: 'Prazo de Pagamento',
    beneficio: 'Benefício Mais Útil',
    futuro: 'Interesse em Novos Benefícios',
    contato: 'Contato',
    atual: 'Empréstimo Atual',
};

function exportExcel() {
    if (!lastData || lastData.length === 0) return;
    if (!window.XLSX) {
        alert('Biblioteca XLSX ainda carregando. Tente novamente.');
        return;
    }

    var btn = document.getElementById('btnExport');
    btn.classList.add('exporting');
    btn.textContent = 'Gerando...';

    setTimeout(function() {
        try {
            buildExcel(lastData);
        } catch (e) {
            console.error('Erro ao gerar Excel:', e);
            alert('Erro ao gerar Excel: ' + e.message);
        }
        btn.classList.remove('exporting');
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><polyline points="9 15 12 18 15 15"></polyline></svg> Exportar Excel';
    }, 50);
}

function buildExcel(data) {
    var wb = XLSX.utils.book_new();
    var total = data.length;

    var colKeys = ['idade', 'tempo', 'conta', 'poupanca', 'dificuldade', 'emergencia',
                   'interesse', 'finalidade', 'valor', 'prazo', 'beneficio', 'futuro', 'contato', 'atual'];

    // ===== ABA 1: Todos os Dados =====
    var headers = ['#'];
    colKeys.forEach(function(k) { headers.push(FRIENDLY_HEADERS[k] || k); });

    var rows = [headers];
    data.forEach(function(row, idx) {
        var r = [idx + 1];
        colKeys.forEach(function(k) { r.push(findCol(row, k)); });
        rows.push(r);
    });

    var wsData = XLSX.utils.aoa_to_sheet(rows);

    var colWidths = [{ wch: 5 }];
    colKeys.forEach(function(k) {
        var maxLen = (FRIENDLY_HEADERS[k] || k).length;
        data.forEach(function(row) {
            var v = findCol(row, k);
            if (v && v.length > maxLen) maxLen = v.length;
        });
        colWidths.push({ wch: Math.min(maxLen + 2, 50) });
    });
    wsData['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, wsData, 'Respostas Completas');

    // ===== ABA 2: Resumo / KPIs =====
    var interesseCount = data.filter(function(r) {
        return findCol(r, 'interesse') && findCol(r, 'interesse').indexOf('com certeza') !== -1;
    }).length;
    var dificCount = data.filter(function(r) { return findCol(r, 'dificuldade') === 'Sim'; }).length;
    var emergCount = data.filter(function(r) {
        return findCol(r, 'emergencia') && findCol(r, 'emergencia').indexOf('conseguiria') !== -1 && findCol(r, 'emergencia').substring(0, 3) !== 'Sim';
    }).length;
    var empAtual = data.filter(function(r) {
        var v = findCol(r, 'atual');
        return v && v.indexOf('nenhum') === -1 && v.trim() !== '';
    }).length;

    var resumo = [
        ['BRS - Relatório Perfil Financeiro dos Colaboradores'],
        ['Gerado em', new Date().toLocaleString('pt-BR')],
        [],
        ['INDICADORES PRINCIPAIS', '', ''],
        ['Indicador', 'Quantidade', 'Percentual'],
        ['Total de Respostas', total, '100%'],
        ['Interesse em Crédito ("Sim, com certeza")', interesseCount, pct(interesseCount, total) + '%'],
        ['Dificuldade com Crédito (Sim)', dificCount, pct(dificCount, total) + '%'],
        ['Sem Reserva Emergencial', emergCount, pct(emergCount, total) + '%'],
        ['Já Possuem Empréstimo', empAtual, pct(empAtual, total) + '%'],
    ];

    var distSheets = [
        { key: 'idade', title: 'FAIXA DE IDADE' },
        { key: 'tempo', title: 'TEMPO DE EMPRESA' },
        { key: 'conta', title: 'CONTA EM BANCO' },
        { key: 'poupanca', title: 'HÁBITO DE POUPANÇA' },
        { key: 'dificuldade', title: 'DIFICULDADE COM CRÉDITO' },
        { key: 'emergencia', title: 'RESERVA DE EMERGÊNCIA' },
        { key: 'interesse', title: 'INTERESSE NO CRÉDITO' },
        { key: 'finalidade', title: 'FINALIDADE DO CRÉDITO' },
        { key: 'valor', title: 'VALOR DESEJADO' },
        { key: 'prazo', title: 'PRAZO DE PAGAMENTO' },
        { key: 'beneficio', title: 'BENEFÍCIO MAIS ÚTIL' },
        { key: 'futuro', title: 'INTERESSE EM NOVOS BENEFÍCIOS' },
        { key: 'atual', title: 'EMPRÉSTIMO ATUAL' },
    ];

    distSheets.forEach(function(ds) {
        resumo.push([]);
        resumo.push([ds.title, '', '']);
        resumo.push(['Resposta', 'Quantidade', 'Percentual']);
        var counts = countByCol(data, ds.key);
        var entries = sortedEntries(counts);
        entries.forEach(function(e) {
            resumo.push([e[0], e[1], pct(e[1], total) + '%']);
        });
    });

    var wsResumo = XLSX.utils.aoa_to_sheet(resumo);
    wsResumo['!cols'] = [{ wch: 50 }, { wch: 15 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo e Indicadores');

    var filename = 'BRS_Relatorio_Financeiro_' + new Date().toISOString().slice(0, 10) + '.xlsx';
    XLSX.writeFile(wb, filename);
}

// --- Init ---
chartDefaults();
fetchData();
setInterval(fetchData, REFRESH_INTERVAL);
