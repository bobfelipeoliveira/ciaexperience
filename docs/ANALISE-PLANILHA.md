# Análise da planilha de origem

Arquivo: *Quadro básico monitoramento atend. intercorrência (7).xlsx* — aba **`Coleta de urina `** (com espaço no fim do nome).
Esta análise **não contém dados de pacientes**: somente estrutura e contagens. A planilha **não** é versionada.

## Estrutura

- 11 abas no arquivo; somente `Coleta de urina ` é usada. As demais (NIP, Julho, Agosto, Setembro, Outubro TÉC, Novembro TÉC, Análise Outubro/Novembro, Enf. INTERNO, Planilha1) são ignoradas.
- **192 registros**, cabeçalho na linha 1, **18 colunas**, recebimentos de 29/08/2026 a 23/11/2026.

| # | Coluna original | Campo no sistema | Vazios | Observações |
|---|---|---|---|---|
| 1 | TURNO | `receipt_shift` | 0 | `DIURNO `, `diurno`, `noturno` → DIURNO/NOTURNO |
| 2 | DATA DO RECEBIMENTO | `received_date` | 0 | todas datas válidas |
| 3 | ORIGEM DA SOLICITAÇÃO | `origin` | 0 | `INTERCORRENCIA `, `intercorrencia ` → INTERCORRÊNCIA; `ELEETIVO ` → TICKET ELETIVO; `Demanda externa ` → DEMANDA EXTERNA |
| 4 | NOME DO PACIENTE | `patient_name` | 0 | 37 pacientes aparecem mais de uma vez (coletas diferentes) |
| 5 | FORMA DE COLETA | `collection_method` | 1 | `CVA `, `cva`, `cvd` → CVA/CVD |
| 6 | MATERIAL NA CASA… (Potinho) | `material_available` | 2 | `NÂO`, `Não `, `NAO`, `sim ` → SIM/NÃO |
| 7 | DATA AGENDADA | `scheduled_date` (ou `original_scheduled_date` se reagendada) | 3 | 1 valor inválido (`11/111/2026`); 1 data anterior ao recebimento (02/02/2026) |
| 8 | NOME DO FAMILIAR… | `family_contact_name` | 5 | |
| 9 | Telefone de contato | `contact_phone` | 16 | 70 numéricos + 106 texto em formatos variados → padronizados `(21) 99999-9999` |
| 10 | COLABORADOR RESPONSÁVEL… | `scheduler_name` | 2 | ~20 grafias para ~13 pessoas (`CONCEIÇÂO`/`CONCEICAO`, ponto final, espaço) — normalizadas sem alterar o nome |
| 11 | CONVÊNIO | `health_plan` | 5 | AMIL/Amil/amil, `Solar - Unimed Brasil`… → AMIL, UNIMED, UNIMED BRASIL, CASSI… |
| 12 | BAIRRO | `neighborhood` + `city` | 6 | 29 linhas trazem o **município** (Niterói, São Gonçalo, Duque de Caxias…) → gravado como cidade |
| 13 | Necessidade de reagendamento? | `needs_reschedule` | 72 | SIM 23 / NÃO 97 |
| 14 | DATA REAGENDADA | `scheduled_date` + histórico | 168 | 1 valor `*` ignorado |
| 15 | SUPORTE ROTA | `route_support` | 77 | |
| 16 | ENFERMEIRO QUE REALIZOU | `nurse_name` | 81 | `WELLINGTON LUIZ`/`LUIS` mantidos como digitados |
| 17 | DATA DA COLETA | `collected_date` | 80 | define REALIZADA |
| 18 | Observação | `legacy_notes` | 152 | preservada integralmente |

## Regras de conversão (sem inventar dados)

- **Status:** REALIZADA somente com DATA DA COLETA (112); com data agendada → AGENDADA (72) ou REAGENDADA (5); sem data → RECEBIDA (3).
  - 5 linhas têm enfermeiro mas não têm data da coleta → **não** são marcadas como realizadas (alerta na prévia).
  - 6 linhas têm data da coleta sem enfermeiro → realizadas, enfermeiro NÃO INFORMADO.
- **Prioridade** não existe na planilha → fica NÃO INFORMADA (não é deduzida da origem).
- Registros AGENDADOS com data passada entrarão no alerta **"Coletas atrasadas"** — revise e atualize a situação real de cada um após importar (ou arquive).
- Chave de importação determinística (paciente + recebimento + agendamento + familiar + colaborador): reimportar não duplica (192 chaves únicas).
- A linha original completa fica em `legacy_data` para conferência e auditoria.

## Novos campos (exportação ampliada)

Prioridade, justificativa, status, idade, período/horário, endereço completo e separado, cidade, UF, CEP, referência,
profissional previsto, responsável/prazo do material, motivo de cancelamento, resultado operacional, forma de registro, datas de criação/atualização.
