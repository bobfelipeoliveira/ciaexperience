import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractFromText } from '../src/modules/urine-collection/domain/parser.ts';
import { parseAddress } from '../src/modules/urine-collection/domain/address.ts';

const ctx = { today: '2026-11-24', nowHour: 10 };

test('exemplo do enunciado', () => {
  const t = 'Paciente Maria da Silva, 82 anos, necessita de coleta de urina por CVA. Solicitação recebida pela Intercorrência. Coleta eletiva para amanhã pela manhã. Familiar confirmou, é a filha Ana, telefone 21999999999. Tem potinho na residência. Endereço: Rua das Flores, 120, apartamento 301, Vila da Penha, Rio de Janeiro.';
  const r = extractFromText(t, ctx);
  assert.equal(r.patient_name.value, 'Maria da Silva');
  assert.equal(r.patient_age.value, 82);
  assert.equal(r.collection_method.value, 'CVA');
  assert.equal(r.origin.value, 'INTERCORRENCIA');
  assert.equal(r.priority.value, 'ELETIVA');
  assert.equal(r.scheduled_date.value, '2026-11-25');
  assert.equal(r.scheduled_period.value, 'MANHA');
  assert.equal(r.material_available.value, 'SIM');
  assert.equal(r.family_contact_name.value, 'Ana (filha)');
  assert.equal(r.contact_phone.value, '(21) 99999-9999');
  const a = r.address.value!;
  assert.equal(a.street, 'Rua das Flores');
  assert.equal(a.number, '120');
  assert.equal(a.complement, 'apartamento 301');
  assert.equal(a.neighborhood, 'Vila da Penha');
  assert.equal(a.city, 'Rio de Janeiro');
  assert.equal(a.cep, null);
  assert.equal(r.received_date.confidence, 'inferred');
});

test('não inventa: texto sem informações', () => {
  const r = extractFromText('Preciso agendar uma coleta para o senhor do quarto', ctx);
  assert.equal(r.patient_name.value, null);
  assert.equal(r.material_available.value, null, 'ausência não vira NÃO');
  assert.equal(r.collection_method.value, null);
  assert.equal(r.priority.value, null);
  assert.equal(r.origin.value, null);
  assert.equal(r.contact_phone.value, null);
});

test('negativas, emergência, CVD, ticket e data explícita', () => {
  const t = 'PACIENTE JOSE CARLOS PEREIRA - CVD. Ticket eletivo. EMERGENCIAL - justificativa: febre alta e urina com odor forte. Não tem potinho em casa. Coleta dia 27/11 às 9h. Esposa Sra. Lúcia (21) 98888-7777. Convênio Unimed. Av. Brás de Pina 300 casa 2 - Penha - RJ, CEP 21070-030';
  const r = extractFromText(t, ctx);
  assert.equal(r.patient_name.value, 'Jose Carlos Pereira');
  assert.equal(r.collection_method.value, 'CVD');
  assert.equal(r.origin.value, 'TICKET_ELETIVO');
  assert.equal(r.priority.value, 'URGENTE', 'emergencial é tratado como URGENTE');
  assert.equal(r.material_available.value, 'NAO');
  assert.equal(r.scheduled_date.value, '2026-11-27');
  assert.equal(r.scheduled_time.value, '09:00');
  assert.equal(r.family_contact_name.value, 'Lúcia (esposa)');
  assert.equal(r.contact_phone.value, '(21) 98888-7777');
  assert.equal(r.health_plan.value, 'Unimed');
  assert.equal(r.cep.value, '21070-030');
  assert.equal(r.address.value?.neighborhood, 'Penha');
});

test('CVA e CVD juntos geram conflito', () => {
  const r = extractFromText('Paciente Ana Lima, era CVA agora CVD?', ctx);
  assert.equal(r.collection_method.value, null);
  assert.equal(r.conflicts.length, 1);
});

test('material não confirmado', () => {
  const r = extractFromText('Paciente Rita Souza. Verificar se tem potinho.', ctx);
  assert.equal(r.material_available.value, 'NAO_CONFIRMADO');
});

test('endereço: CEP opcional e variações', () => {
  const a = parseAddress('Rua Barão de Mesquita, 500, bloco 2 apto 1001, Tijuca, Rio de Janeiro/RJ');
  assert.equal(a.street, 'Rua Barão de Mesquita');
  assert.equal(a.number, '500');
  assert.equal(a.neighborhood, 'Tijuca');
  assert.equal(a.city, 'Rio de Janeiro');
  assert.equal(a.state, 'RJ');
  const b = parseAddress('Estrada do Mato Alto 1234, Guaratiba');
  assert.equal(b.street, 'Estrada do Mato Alto');
  assert.equal(b.number, '1234');
  assert.equal(b.neighborhood, 'Guaratiba');
  const c = parseAddress('Rua Coronel Moreira César, 200, Icaraí, Niterói - RJ, próximo ao mercado');
  assert.equal(c.city, 'Niterói');
  assert.equal(c.neighborhood, 'Icaraí');
  assert.match(c.reference ?? '', /mercado/);
  const d = parseAddress('Rua A, 10, Vista Alegre, São Gonçalo');
  assert.equal(d.neighborhood, 'Vista Alegre');
  assert.equal(d.city, 'São Gonçalo');
});

// Formato real da operação: mensagem do WhatsApp + texto lido (OCR) do print do prontuário.
// DADOS FICTÍCIOS.
const WHATS = `Técnica Exemplo: Pac:   Marlene Souza Prado
Data : 27 /11/2026
Usa: CVD (  )  CVA (x  ) - sem material na residencia
Informações a serem confirmadas com a família: chegar na residencia as 09:30

1. Material na casa para coleta, potinho para o responsável entregar no laboratório: SIM

2. Horário de recebimento de coleta do laboratório: Sim

3. - Estão em posse do pedido médico de exame para entregar ao laboratório? Sim.

4. Informar qual nome do familiar que recebeu as informações, telefone, data)a e horário do contato:  Cláudia  filha - ( 21990000003)`;

const OCR = `| Nome: Marlene Souza Prado
| Nº Atendimento: 12345 Idade: 88a Sexo: Feminino
| Profissão:Doméstica Nacionalidade: Brasileira
| Contrato: Solar - Amil - PF
| Endereço: Rua Exemplo da Silva - Casa 02 -
| Lote 5 - Engenho Pequeno - Sao Goncalo
| Telefone de contato: |Tel Comercial(21990000001 Beatriz filha)|Tel Celular(21990000002 Denise filha)|Tel Contato(21990000003 Cláudia filha)|E-mail(exemplo@exemplo.com)
| Data de internação: 10/11/2026
| Motivo do atendimento: TECNICO DE ENFERMAGEM
24H / MEDICO MENSAL / ENFERMEIRO QUINZENAL`;

test('WhatsApp + print do prontuário (formato da operação)', () => {
  const r = extractFromText(WHATS + '\n\n' + OCR, { today: '2026-11-26', nowHour: 10 });
  assert.equal(r.patient_name.value, 'Marlene Souza Prado');
  assert.equal(r.conflicts.filter((c) => /nomes diferentes/.test(c)).length, 0);
  assert.equal(r.scheduler_name.value, 'Técnica Exemplo');
  assert.equal(r.patient_age.value, 88);
  assert.equal(r.collection_method.value, 'CVA', 'opção marcada com (x)');
  assert.equal(r.scheduled_date.value, '2026-11-27');
  assert.equal(r.scheduled_date.confidence, 'inferred', 'campo "Data" genérico deve ser conferido');
  assert.equal(r.scheduled_time.value, '09:30');
  assert.equal(r.material_available.value, null, 'contradição: não decide sozinho');
  assert.ok(r.conflicts.some((c) => /material/i.test(c)));
  assert.equal(r.family_contact_name.value, 'Cláudia (filha)');
  assert.equal(r.contact_phone.value, '(21) 99000-0003');
  assert.equal(r.health_plan.value, 'Amil - PF');
  assert.equal(r.address.value?.street, 'Rua Exemplo da Silva');
  assert.match(r.address.value?.complement ?? '', /Casa 02/);
  assert.equal(r.neighborhood.value, 'Engenho Pequeno');
  assert.equal(r.city.value, 'São Gonçalo');
  assert.equal(r.origin.value, null);
  assert.equal(r.priority.value, null);
  const notes = r.notes.value ?? '';
  assert.match(notes, /Nº atendimento: 12345/);
  assert.match(notes, /TECNICO DE ENFERMAGEM 24H/);
  assert.match(notes, /pedido médico.*SIM/i);
  assert.match(notes, /Beatriz \(filha\)/);
  assert.doesNotMatch(notes, /exemplo@exemplo/, 'e-mail não é copiado (minimização)');
  assert.doesNotMatch(notes, /Cláudia \(filha\) \(21\) 99000-0003/, 'contato escolhido não se repete');
});

test('só a mensagem do WhatsApp, sem o print', () => {
  const r = extractFromText(WHATS.replace('- sem material na residencia', ''), { today: '2026-11-26', nowHour: 10 });
  assert.equal(r.patient_name.value, 'Marlene Souza Prado');
  assert.equal(r.material_available.value, 'SIM');
  assert.equal(r.collection_method.value, 'CVA');
});

test('texto lido do print com quebras de linha do OCR', () => {
  const ocr = `Nome: Marlene Souza Prado
Endereço: Rua Exemplo da Silva - Casa 02 - Lote 5- Engenho
Pequeno - Sao Goncalo

Telefone de contato: [Tel Comercial(21990000001 Beatriz
filha)|Tel Celular(21990000002 Denise filha)`;
  const r = extractFromText(ocr, { today: '2026-11-26', nowHour: 10 });
  assert.equal(r.neighborhood.value, 'Engenho Pequeno');
  assert.equal(r.city.value, 'São Gonçalo');
  assert.match(r.address.value?.complement ?? '', /Lote 5/);
});

test('endereço sem "Rua/Av." antes do nome', () => {
  const a = parseAddress('Lúcio Costa, 375, Barra da Tijuca, Rio de Janeiro');
  assert.equal(a.street, 'Lúcio Costa');
  assert.equal(a.number, '375');
  assert.equal(a.neighborhood, 'Barra da Tijuca');
});
