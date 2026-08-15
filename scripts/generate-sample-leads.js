#!/usr/bin/env node
/**
 * Gera um CSV de exemplo com 1000 leads fictícios (mas válidos),
 * incluindo alguns duplicados e inválidos para validar o pipeline.
 * Uso: node scripts/generate-sample-leads.js [quantidade] [saida.csv]
 */
const { writeFileSync } = require('fs');
const { join } = require('path');

const count = Number(process.argv[2] || 1000);
const output = process.argv[3] || join(__dirname, '..', 'data', 'sample-leads.csv');

const NAMES = ['Barbearia do João', 'Salão da Maria', 'Studio Corte Fix', 'Barbearia Central', 'Cabelo & Arte', 'Salão Estilo', 'Barbearia Urbana', 'Studio Beleza Real', 'Barbearia Nobre', 'Salão da Praça'];
const CITIES = ['São Paulo', 'Rio de Janeiro', 'Belo Horizonte', 'Campinas', 'Curitiba', 'Porto Alegre', 'Salvador', 'Recife', 'Fortaleza', 'Goiânia'];
const STATES = ['SP', 'RJ', 'MG', 'SP', 'PR', 'RS', 'BA', 'PE', 'CE', 'GO'];

function randomPhone(i) {
  const ddd = ['11', '21', '31', '19', '41', '51', '71', '81', '85', '62'][i % 10];
  const base = (10000000 + i * 137) % 90000000;
  const num = String(base).padStart(8, '0');
  return `(${ddd}) 9${num.slice(0, 4)}-${num.slice(4)}`;
}

function slug(i) {
  return `lead-${i}@exemplo.com.br`;
}

const rows = ['nome;telefone;email;empresa;cidade;estado;id_externo'];

for (let i = 0; i < count; i += 1) {
  const name = NAMES[i % NAMES.length];
  const city = CITIES[i % CITIES.length];
  const state = STATES[i % STATES.length];
  const phone = randomPhone(i);
  const email = slug(i);

  // ~2% inválidos (telefone quebrado E sem e-mail)
  if (i % 47 === 0) {
    rows.push(`${name};SEM_TELEFONE_VALIDO;;${name};${city};${state};EXT-${i}`);
    continue;
  }

  // ~1.5% sem e-mail
  if (i % 67 === 0) {
    rows.push(`${name};${phone};;${name};${city};${state};EXT-${i}`);
    continue;
  }

  // ~1.5% duplicados (mesmo telefone da linha anterior, que é válida)
  if (i % 71 === 0 && i > 0) {
    rows.push(`${name};${randomPhone(i - 1)};${email};${name};${city};${state};EXT-${i}`);
    continue;
  }

  rows.push(`${name};${phone};${email};${name};${city};${state};EXT-${i}`);
}

writeFileSync(output, rows.join('\n'), 'utf8');
console.log(`Arquivo gerado: ${output} (${count} linhas)`);
