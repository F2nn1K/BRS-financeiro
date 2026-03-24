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
            document.getElementById('btnExportPdf').disabled = false;
        }
    } catch (err) {
        console.error('Erro ao buscar dados:', err);
        document.getElementById('lastUpdate').textContent = 'Erro ao atualizar - tentando novamente...';
    }
}

// --- PDF Export ---

var lastData = null;

function exportPDF() {
    if (!lastData || lastData.length === 0) return;
    var btn = document.getElementById('btnExportPdf');
    btn.classList.add('exporting');
    btn.textContent = 'Gerando PDF...';

    setTimeout(function() {
        try {
            buildPDF(lastData);
        } catch (e) {
            console.error('Erro ao gerar PDF:', e);
        }
        btn.classList.remove('exporting');
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><polyline points="9 15 12 18 15 15"></polyline></svg> Exportar PDF';
    }, 100);
}

function buildPDF(data) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
        alert('Biblioteca jsPDF ainda carregando. Tente novamente em alguns segundos.');
        return;
    }
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF('p', 'mm', 'a4');
    var W = 210, H = 297;
    var margin = 15;
    var contentW = W - margin * 2;
    var y = 0;

    var total = data.length;
    var interesseCount = data.filter(function(r) {
        return findCol(r, 'interesse') && findCol(r, 'interesse').indexOf('com certeza') !== -1;
    }).length;
    var dificCount = data.filter(function(r) { return findCol(r, 'dificuldade') === 'Sim'; }).length;
    var emergCount = data.filter(function(r) {
        return findCol(r, 'emergencia') && findCol(r, 'emergencia').indexOf('conseguiria') !== -1 && findCol(r, 'emergencia').substring(0,3) !== 'Sim';
    }).length;
    var empAtual = data.filter(function(r) {
        var v = findCol(r, 'atual');
        return v && v.indexOf('nenhum') === -1 && v.trim() !== '';
    }).length;

    // --- PAGE 1: Cover + KPIs ---
    // Dark background
    doc.setFillColor(10, 14, 26);
    doc.rect(0, 0, W, H, 'F');

    // Header bar
    doc.setFillColor(26, 34, 54);
    doc.rect(0, 0, W, 48, 'F');

    // Blue accent line
    doc.setFillColor(59, 130, 246);
    doc.rect(0, 48, W, 1.5, 'F');

    // Logo text
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(28);
    doc.setTextColor(59, 130, 246);
    doc.text('BRS', margin, 22);

    // Divider
    doc.setDrawColor(51, 65, 85);
    doc.setLineWidth(0.3);
    doc.line(margin + 28, 12, margin + 28, 30);

    // Title
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(148, 163, 184);
    doc.text('Perfil Financeiro dos Colaboradores', margin + 33, 19);

    // Date
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    var dateStr = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    doc.text(dateStr, margin + 33, 27);

    // Report badge
    doc.setFillColor(59, 130, 246);
    doc.roundedRect(W - margin - 45, 14, 45, 10, 3, 3, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text('RELATORIO BI', W - margin - 40, 20.5);

    y = 62;

    // Section: KPIs
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('INDICADORES PRINCIPAIS', margin, y);
    y += 8;

    var kpis = [
        { label: 'Total de Respostas', value: String(total), sub: 'colaboradores responderam', color: [96, 165, 250] },
        { label: 'Interesse em Credito', value: pct(interesseCount, total) + '%', sub: interesseCount + ' de ' + total + ' colaboradores', color: [16, 185, 129] },
        { label: 'Dificuldade c/ Credito', value: pct(dificCount, total) + '%', sub: dificCount + ' colaboradores', color: [245, 158, 11] },
        { label: 'Sem Reserva Emergencial', value: pct(emergCount, total) + '%', sub: emergCount + ' colaboradores', color: [239, 68, 68] },
        { label: 'Ja Possuem Emprestimo', value: pct(empAtual, total) + '%', sub: empAtual + ' colaboradores', color: [139, 92, 246] },
    ];

    var kpiW = (contentW - 8) / 2.5;
    var kpiH = 32;
    var col = 0;
    var startY = y;

    kpis.forEach(function(kpi, i) {
        var kx = margin + (i % 3) * (kpiW + 4);
        var ky = startY + Math.floor(i / 3) * (kpiH + 4);

        // Card bg
        doc.setFillColor(26, 34, 54);
        doc.roundedRect(kx, ky, kpiW, kpiH, 3, 3, 'F');

        // Top accent
        doc.setFillColor(kpi.color[0], kpi.color[1], kpi.color[2]);
        doc.rect(kx, ky, kpiW, 1.5, 'F');

        // Label
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(100, 116, 139);
        doc.text(kpi.label.toUpperCase(), kx + 5, ky + 8);

        // Value
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
        doc.text(kpi.value, kx + 5, ky + 21);

        // Sub
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(148, 163, 184);
        doc.text(kpi.sub, kx + 5, ky + 28);
    });

    y = startY + kpiH * 2 + 12 + 8;

    // --- CHARTS SECTION ---
    var chartPairs = [
        { section: 'PERFIL DOS COLABORADORES', charts: ['chartIdade', 'chartTempo', 'chartConta'] },
        { section: 'COMPORTAMENTO FINANCEIRO', charts: ['chartPoupanca', 'chartEmergencia', 'chartDificuldade'] },
        { section: 'INTERESSE NO CREDITO EMPRESARIAL', charts: ['chartInteresse', 'chartFinalidade'] },
        { section: 'VALORES E PRAZOS', charts: ['chartValor', 'chartPrazo'] },
        { section: 'BENEFICIOS E SITUACAO ATUAL', charts: ['chartBeneficio', 'chartAtual'] },
        { section: 'INTERESSE EM NOVOS BENEFICIOS', charts: ['chartFuturo'] },
    ];

    var chartTitles = {
        chartIdade: 'Faixa Etaria',
        chartTempo: 'Tempo de Empresa',
        chartConta: 'Tipo de Conta Bancaria',
        chartPoupanca: 'Habito de Poupanca',
        chartEmergencia: 'Capacidade em Emergencia',
        chartDificuldade: 'Dificuldade com Credito',
        chartInteresse: 'Interesse no Credito em Folha',
        chartFinalidade: 'Finalidade do Credito',
        chartValor: 'Valor de Emprestimo Desejado',
        chartPrazo: 'Prazo de Pagamento',
        chartBeneficio: 'Beneficio Financeiro Mais Util',
        chartAtual: 'Emprestimo/Credito Atual',
        chartFuturo: 'Interesse em Novos Beneficios',
    };

    chartPairs.forEach(function(group) {
        var chartImgs = [];
        group.charts.forEach(function(id) {
            var canvas = document.getElementById(id);
            if (canvas) {
                chartImgs.push({ id: id, img: canvas.toDataURL('image/png', 1.0) });
            }
        });

        if (chartImgs.length === 0) return;

        var sectionH = 8;
        var chartH = chartImgs.length <= 2 ? 62 : 55;
        var totalH = sectionH + chartH + 6;

        if (y + totalH > H - 20) {
            doc.addPage();
            doc.setFillColor(10, 14, 26);
            doc.rect(0, 0, W, H, 'F');
            y = 15;
        }

        // Section title
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text(group.section, margin, y + 5);
        y += sectionH + 2;

        if (chartImgs.length === 1) {
            var cw = contentW * 0.55;
            doc.setFillColor(26, 34, 54);
            doc.roundedRect(margin, y, cw, chartH, 3, 3, 'F');

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5);
            doc.setTextColor(241, 245, 249);
            doc.text(chartTitles[chartImgs[0].id] || '', margin + 5, y + 7);

            doc.addImage(chartImgs[0].img, 'PNG', margin + 3, y + 10, cw - 6, chartH - 14);
        } else if (chartImgs.length === 2) {
            var cw2 = (contentW - 4) / 2;
            chartImgs.forEach(function(ci, idx) {
                var cx = margin + idx * (cw2 + 4);
                doc.setFillColor(26, 34, 54);
                doc.roundedRect(cx, y, cw2, chartH, 3, 3, 'F');

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(7.5);
                doc.setTextColor(241, 245, 249);
                doc.text(chartTitles[ci.id] || '', cx + 5, y + 7);

                doc.addImage(ci.img, 'PNG', cx + 3, y + 10, cw2 - 6, chartH - 14);
            });
        } else {
            var cw3 = (contentW - 8) / 3;
            chartImgs.forEach(function(ci, idx) {
                var cx = margin + idx * (cw3 + 4);
                doc.setFillColor(26, 34, 54);
                doc.roundedRect(cx, y, cw3, chartH, 3, 3, 'F');

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(7);
                doc.setTextColor(241, 245, 249);
                doc.text(chartTitles[ci.id] || '', cx + 4, y + 7);

                doc.addImage(ci.img, 'PNG', cx + 2, y + 10, cw3 - 4, chartH - 14);
            });
        }

        y += chartH + 8;
    });

    // Footer on last page
    var footerY = H - 10;
    doc.setDrawColor(30, 41, 59);
    doc.setLineWidth(0.2);
    doc.line(margin, footerY - 4, W - margin, footerY - 4);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text('BRS Sistemas  |  Dashboard BI - Perfil Financeiro dos Colaboradores', margin, footerY);

    var genDate = 'Gerado em ' + new Date().toLocaleString('pt-BR');
    doc.text(genDate, W - margin - doc.getTextWidth(genDate), footerY);

    // Add page numbers to all pages
    var totalPages = doc.internal.getNumberOfPages();
    for (var p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        var pageText = 'Pagina ' + p + ' de ' + totalPages;
        doc.text(pageText, W / 2 - doc.getTextWidth(pageText) / 2, H - 5);
    }

    doc.save('BRS_Relatorio_Financeiro_' + new Date().toISOString().slice(0, 10) + '.pdf');
}

// --- Init ---
chartDefaults();
fetchData();
setInterval(fetchData, REFRESH_INTERVAL);
