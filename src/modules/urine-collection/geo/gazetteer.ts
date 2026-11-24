/**
 * Base geográfica LOCAL (não envia nenhum dado para a internet).
 *
 * Coordenadas APROXIMADAS do centro de cada bairro/município (precisão de
 * aproximadamente 1–2 km), suficientes para visualizar a distribuição
 * regional e sugerir agrupamentos. NÃO representam o endereço do paciente.
 *
 * Para ampliar a cobertura, acrescente linhas no formato:
 *   ['Nome do bairro', 'Município', 'Região', latitude, longitude]
 */
import { normalize } from '../../../core/lib/text.ts';

export type Region =
  | 'Centro' | 'Zona Sul' | 'Zona Norte' | 'Grande Tijuca' | 'Ilha do Governador' | 'Zona Oeste'
  | 'Barra e Jacarepaguá' | 'Leste Fluminense' | 'Baixada Fluminense' | 'Região Serrana'
  | 'Região dos Lagos' | 'Costa Verde' | 'Médio Paraíba' | 'Norte Fluminense';

export interface Place { name: string; city: string; region: Region; lat: number; lng: number; kind: 'BAIRRO' | 'MUNICIPIO'; }

const RJ = 'Rio de Janeiro';
type Row = [string, string, Region, number, number];

const NEIGHBORHOODS: Row[] = [
  // Centro
  ['Centro', RJ, 'Centro', -22.9068, -43.1729], ['Lapa', RJ, 'Centro', -22.9133, -43.1806],
  ['Santa Teresa', RJ, 'Centro', -22.9213, -43.1873], ['Gamboa', RJ, 'Centro', -22.8970, -43.1940],
  ['Saúde', RJ, 'Centro', -22.8960, -43.1860], ['Santo Cristo', RJ, 'Centro', -22.8990, -43.2000],
  ['Catumbi', RJ, 'Centro', -22.9180, -43.1980], ['Estácio', RJ, 'Centro', -22.9140, -43.2040],
  ['Cidade Nova', RJ, 'Centro', -22.9110, -43.2020], ['Rio Comprido', RJ, 'Centro', -22.9220, -43.2070],
  ['Caju', RJ, 'Centro', -22.8800, -43.2240], ['Paquetá', RJ, 'Centro', -22.7620, -43.1080],
  // Zona Sul
  ['Copacabana', RJ, 'Zona Sul', -22.9711, -43.1822], ['Leme', RJ, 'Zona Sul', -22.9630, -43.1690],
  ['Ipanema', RJ, 'Zona Sul', -22.9838, -43.2096], ['Leblon', RJ, 'Zona Sul', -22.9847, -43.2234],
  ['Botafogo', RJ, 'Zona Sul', -22.9519, -43.1846], ['Flamengo', RJ, 'Zona Sul', -22.9329, -43.1757],
  ['Laranjeiras', RJ, 'Zona Sul', -22.9367, -43.1880], ['Catete', RJ, 'Zona Sul', -22.9258, -43.1766],
  ['Glória', RJ, 'Zona Sul', -22.9203, -43.1766], ['Cosme Velho', RJ, 'Zona Sul', -22.9420, -43.1980],
  ['Humaitá', RJ, 'Zona Sul', -22.9558, -43.1990], ['Urca', RJ, 'Zona Sul', -22.9497, -43.1640],
  ['Lagoa', RJ, 'Zona Sul', -22.9700, -43.2050], ['Jardim Botânico', RJ, 'Zona Sul', -22.9666, -43.2232],
  ['Gávea', RJ, 'Zona Sul', -22.9790, -43.2330], ['São Conrado', RJ, 'Zona Sul', -22.9990, -43.2600],
  ['Rocinha', RJ, 'Zona Sul', -22.9878, -43.2480], ['Vidigal', RJ, 'Zona Sul', -22.9930, -43.2390],
  // Grande Tijuca
  ['Tijuca', RJ, 'Grande Tijuca', -22.9250, -43.2330], ['Vila Isabel', RJ, 'Grande Tijuca', -22.9160, -43.2470],
  ['Grajaú', RJ, 'Grande Tijuca', -22.9220, -43.2620], ['Andaraí', RJ, 'Grande Tijuca', -22.9270, -43.2530],
  ['Maracanã', RJ, 'Grande Tijuca', -22.9130, -43.2300], ['Praça da Bandeira', RJ, 'Grande Tijuca', -22.9110, -43.2140],
  ['Alto da Boa Vista', RJ, 'Grande Tijuca', -22.9600, -43.2770],
  // Zona Norte
  ['São Cristóvão', RJ, 'Zona Norte', -22.8990, -43.2230], ['Benfica', RJ, 'Zona Norte', -22.8920, -43.2390],
  ['Mangueira', RJ, 'Zona Norte', -22.9050, -43.2380], ['Vasco da Gama', RJ, 'Zona Norte', -22.8930, -43.2290],
  ['Méier', RJ, 'Zona Norte', -22.9020, -43.2800], ['Engenho Novo', RJ, 'Zona Norte', -22.9040, -43.2660],
  ['Sampaio', RJ, 'Zona Norte', -22.9060, -43.2600], ['Riachuelo', RJ, 'Zona Norte', -22.9010, -43.2560],
  ['Rocha', RJ, 'Zona Norte', -22.9030, -43.2500], ['Lins de Vasconcelos', RJ, 'Zona Norte', -22.9150, -43.2780],
  ['Cachambi', RJ, 'Zona Norte', -22.8880, -43.2740], ['Todos os Santos', RJ, 'Zona Norte', -22.8970, -43.2850],
  ['Engenho de Dentro', RJ, 'Zona Norte', -22.8960, -43.2950], ['Água Santa', RJ, 'Zona Norte', -22.9100, -43.3010],
  ['Encantado', RJ, 'Zona Norte', -22.8920, -43.3000], ['Piedade', RJ, 'Zona Norte', -22.8890, -43.3090],
  ['Abolição', RJ, 'Zona Norte', -22.8840, -43.3010], ['Pilares', RJ, 'Zona Norte', -22.8770, -43.2960],
  ['Quintino Bocaiúva', RJ, 'Zona Norte', -22.8880, -43.3190], ['Cascadura', RJ, 'Zona Norte', -22.8820, -43.3290],
  ['Madureira', RJ, 'Zona Norte', -22.8730, -43.3380], ['Campinho', RJ, 'Zona Norte', -22.8870, -43.3470],
  ['Vaz Lobo', RJ, 'Zona Norte', -22.8580, -43.3260], ['Oswaldo Cruz', RJ, 'Zona Norte', -22.8710, -43.3480],
  ['Bento Ribeiro', RJ, 'Zona Norte', -22.8660, -43.3600], ['Marechal Hermes', RJ, 'Zona Norte', -22.8590, -43.3700],
  ['Rocha Miranda', RJ, 'Zona Norte', -22.8480, -43.3460], ['Honório Gurgel', RJ, 'Zona Norte', -22.8430, -43.3570],
  ['Turiaçu', RJ, 'Zona Norte', -22.8670, -43.3410], ['Irajá', RJ, 'Zona Norte', -22.8320, -43.3280],
  ['Vista Alegre', RJ, 'Zona Norte', -22.8290, -43.3150], ['Vila da Penha', RJ, 'Zona Norte', -22.8410, -43.3110],
  ['Vicente de Carvalho', RJ, 'Zona Norte', -22.8530, -43.3130], ['Vila Kosmos', RJ, 'Zona Norte', -22.8500, -43.3020],
  ['Penha', RJ, 'Zona Norte', -22.8410, -43.2800], ['Penha Circular', RJ, 'Zona Norte', -22.8370, -43.2940],
  ['Brás de Pina', RJ, 'Zona Norte', -22.8320, -43.2970], ['Cordovil', RJ, 'Zona Norte', -22.8230, -43.3030],
  ['Parada de Lucas', RJ, 'Zona Norte', -22.8150, -43.3020], ['Vigário Geral', RJ, 'Zona Norte', -22.8070, -43.3090],
  ['Jardim América', RJ, 'Zona Norte', -22.8030, -43.3270], ['Olaria', RJ, 'Zona Norte', -22.8460, -43.2650],
  ['Ramos', RJ, 'Zona Norte', -22.8490, -43.2560], ['Bonsucesso', RJ, 'Zona Norte', -22.8640, -43.2560],
  ['Manguinhos', RJ, 'Zona Norte', -22.8780, -43.2470], ['Higienópolis', RJ, 'Zona Norte', -22.8720, -43.2630],
  ['Del Castilho', RJ, 'Zona Norte', -22.8800, -43.2710], ['Maria da Graça', RJ, 'Zona Norte', -22.8830, -43.2640],
  ['Inhaúma', RJ, 'Zona Norte', -22.8740, -43.2800], ['Tomás Coelho', RJ, 'Zona Norte', -22.8680, -43.3040],
  ['Engenho da Rainha', RJ, 'Zona Norte', -22.8670, -43.2930], ['Jacaré', RJ, 'Zona Norte', -22.8880, -43.2560],
  ['Jacarezinho', RJ, 'Zona Norte', -22.8890, -43.2600], ['Complexo do Alemão', RJ, 'Zona Norte', -22.8590, -43.2720],
  ['Pavuna', RJ, 'Zona Norte', -22.8060, -43.3640], ['Anchieta', RJ, 'Zona Norte', -22.8240, -43.4000],
  ['Guadalupe', RJ, 'Zona Norte', -22.8410, -43.3740], ['Ricardo de Albuquerque', RJ, 'Zona Norte', -22.8410, -43.3990],
  ['Coelho Neto', RJ, 'Zona Norte', -22.8290, -43.3520], ['Acari', RJ, 'Zona Norte', -22.8240, -43.3420],
  ['Costa Barros', RJ, 'Zona Norte', -22.8180, -43.3750], ['Parque Colúmbia', RJ, 'Zona Norte', -22.8120, -43.3480],
  ['Barros Filho', RJ, 'Zona Norte', -22.8290, -43.3660], ['Colégio', RJ, 'Zona Norte', -22.8420, -43.3370],
  // Ilha do Governador
  ['Jardim Guanabara', RJ, 'Ilha do Governador', -22.8130, -43.2010], ['Cacuia', RJ, 'Ilha do Governador', -22.8090, -43.1860],
  ['Portuguesa', RJ, 'Ilha do Governador', -22.7980, -43.2090], ['Tauá', RJ, 'Ilha do Governador', -22.7930, -43.1890],
  ['Cocotá', RJ, 'Ilha do Governador', -22.8050, -43.1810], ['Bancários', RJ, 'Ilha do Governador', -22.7880, -43.1830],
  ['Galeão', RJ, 'Ilha do Governador', -22.8100, -43.2470], ['Ilha do Governador', RJ, 'Ilha do Governador', -22.8020, -43.1950],
  ['Pitangueiras', RJ, 'Ilha do Governador', -22.8080, -43.1780], ['Moneró', RJ, 'Ilha do Governador', -22.7960, -43.2000],
  // Zona Oeste
  ['Deodoro', RJ, 'Zona Oeste', -22.8550, -43.3870], ['Vila Militar', RJ, 'Zona Oeste', -22.8600, -43.4000],
  ['Vila Valqueire', RJ, 'Zona Oeste', -22.8840, -43.3660], ['Jardim Sulacap', RJ, 'Zona Oeste', -22.8840, -43.3890],
  ['Magalhães Bastos', RJ, 'Zona Oeste', -22.8710, -43.4160], ['Realengo', RJ, 'Zona Oeste', -22.8790, -43.4290],
  ['Padre Miguel', RJ, 'Zona Oeste', -22.8780, -43.4480], ['Bangu', RJ, 'Zona Oeste', -22.8750, -43.4650],
  ['Senador Camará', RJ, 'Zona Oeste', -22.8730, -43.4900], ['Santíssimo', RJ, 'Zona Oeste', -22.8800, -43.5160],
  ['Campo Grande', RJ, 'Zona Oeste', -22.9020, -43.5620], ['Inhoaíba', RJ, 'Zona Oeste', -22.9050, -43.5870],
  ['Cosmos', RJ, 'Zona Oeste', -22.9100, -43.6150], ['Paciência', RJ, 'Zona Oeste', -22.9050, -43.6380],
  ['Santa Cruz', RJ, 'Zona Oeste', -22.9200, -43.6850], ['Sepetiba', RJ, 'Zona Oeste', -22.9700, -43.7000],
  ['Guaratiba', RJ, 'Zona Oeste', -22.9850, -43.5980], ['Pedra de Guaratiba', RJ, 'Zona Oeste', -23.0010, -43.6390],
  ['Barra de Guaratiba', RJ, 'Zona Oeste', -23.0600, -43.5650], ['Senador Vasconcelos', RJ, 'Zona Oeste', -22.8950, -43.5300],
  // Barra e Jacarepaguá
  ['Barra da Tijuca', RJ, 'Barra e Jacarepaguá', -23.0000, -43.3650], ['Recreio dos Bandeirantes', RJ, 'Barra e Jacarepaguá', -23.0170, -43.4630],
  ['Itanhangá', RJ, 'Barra e Jacarepaguá', -22.9940, -43.3150], ['Joá', RJ, 'Barra e Jacarepaguá', -23.0090, -43.2900],
  ['Jacarepaguá', RJ, 'Barra e Jacarepaguá', -22.9600, -43.3800], ['Freguesia', RJ, 'Barra e Jacarepaguá', -22.9400, -43.3420],
  ['Pechincha', RJ, 'Barra e Jacarepaguá', -22.9310, -43.3560], ['Taquara', RJ, 'Barra e Jacarepaguá', -22.9230, -43.3720],
  ['Tanque', RJ, 'Barra e Jacarepaguá', -22.9150, -43.3600], ['Praça Seca', RJ, 'Barra e Jacarepaguá', -22.8990, -43.3530],
  ['Curicica', RJ, 'Barra e Jacarepaguá', -22.9550, -43.3880], ['Anil', RJ, 'Barra e Jacarepaguá', -22.9530, -43.3390],
  ['Gardênia Azul', RJ, 'Barra e Jacarepaguá', -22.9620, -43.3550], ['Cidade de Deus', RJ, 'Barra e Jacarepaguá', -22.9500, -43.3630],
  ['Camorim', RJ, 'Barra e Jacarepaguá', -22.9700, -43.4300], ['Vargem Grande', RJ, 'Barra e Jacarepaguá', -22.9850, -43.4900],
  ['Vargem Pequena', RJ, 'Barra e Jacarepaguá', -22.9930, -43.4500],
  // Niterói
  ['Icaraí', 'Niterói', 'Leste Fluminense', -22.9050, -43.1100], ['Santa Rosa', 'Niterói', 'Leste Fluminense', -22.9020, -43.0950],
  ['Ingá', 'Niterói', 'Leste Fluminense', -22.9030, -43.1240], ['São Francisco', 'Niterói', 'Leste Fluminense', -22.9170, -43.0940],
  ['Fonseca', 'Niterói', 'Leste Fluminense', -22.8800, -43.0920], ['Itaipu', 'Niterói', 'Leste Fluminense', -22.9530, -43.0410],
  ['Piratininga', 'Niterói', 'Leste Fluminense', -22.9420, -43.0750], ['Barreto', 'Niterói', 'Leste Fluminense', -22.8620, -43.1000],
  ['Pendotiba', 'Niterói', 'Leste Fluminense', -22.9090, -43.0580], ['Charitas', 'Niterói', 'Leste Fluminense', -22.9300, -43.1040],
  // São Gonçalo
  ['Alcântara', 'São Gonçalo', 'Leste Fluminense', -22.8220, -43.0040], ['Neves', 'São Gonçalo', 'Leste Fluminense', -22.8480, -43.0850],
  ['Zé Garoto', 'São Gonçalo', 'Leste Fluminense', -22.8320, -43.0520], ['Vista Alegre', 'São Gonçalo', 'Leste Fluminense', -22.8340, -43.0370],
  ['Trindade', 'São Gonçalo', 'Leste Fluminense', -22.8090, -43.0090], ['Mutondo', 'São Gonçalo', 'Leste Fluminense', -22.8150, -43.0300],
  // Duque de Caxias / Baixada
  ['Saracuruna', 'Duque de Caxias', 'Baixada Fluminense', -22.6750, -43.2580], ['Jardim Primavera', 'Duque de Caxias', 'Baixada Fluminense', -22.6870, -43.2780],
  ['Campos Elíseos', 'Duque de Caxias', 'Baixada Fluminense', -22.7090, -43.2760], ['Gramacho', 'Duque de Caxias', 'Baixada Fluminense', -22.7550, -43.2960],
  ['Xerém', 'Duque de Caxias', 'Baixada Fluminense', -22.5750, -43.3070], ['Vinte e Cinco de Agosto', 'Duque de Caxias', 'Baixada Fluminense', -22.7800, -43.3050],
  ['Comendador Soares', 'Nova Iguaçu', 'Baixada Fluminense', -22.7470, -43.4820],
];

const CITIES: Row[] = [
  [RJ, RJ, 'Centro', -22.9068, -43.1729],
  ['Niterói', 'Niterói', 'Leste Fluminense', -22.8832, -43.1034],
  ['São Gonçalo', 'São Gonçalo', 'Leste Fluminense', -22.8268, -43.0539],
  ['Itaboraí', 'Itaboraí', 'Leste Fluminense', -22.7444, -42.8597],
  ['Maricá', 'Maricá', 'Leste Fluminense', -22.9194, -42.8186],
  ['Tanguá', 'Tanguá', 'Leste Fluminense', -22.7303, -42.7203],
  ['Rio Bonito', 'Rio Bonito', 'Leste Fluminense', -22.7081, -42.6094],
  ['Duque de Caxias', 'Duque de Caxias', 'Baixada Fluminense', -22.7856, -43.3117],
  ['Nova Iguaçu', 'Nova Iguaçu', 'Baixada Fluminense', -22.7556, -43.4603],
  ['São João de Meriti', 'São João de Meriti', 'Baixada Fluminense', -22.8039, -43.3722],
  ['Nilópolis', 'Nilópolis', 'Baixada Fluminense', -22.8079, -43.4136],
  ['Belford Roxo', 'Belford Roxo', 'Baixada Fluminense', -22.7640, -43.3994],
  ['Mesquita', 'Mesquita', 'Baixada Fluminense', -22.7828, -43.4294],
  ['Queimados', 'Queimados', 'Baixada Fluminense', -22.7161, -43.5553],
  ['Japeri', 'Japeri', 'Baixada Fluminense', -22.6431, -43.6533],
  ['Seropédica', 'Seropédica', 'Baixada Fluminense', -22.7442, -43.7072],
  ['Itaguaí', 'Itaguaí', 'Baixada Fluminense', -22.8636, -43.7797],
  ['Magé', 'Magé', 'Baixada Fluminense', -22.6556, -43.0403],
  ['Guapimirim', 'Guapimirim', 'Baixada Fluminense', -22.5372, -42.9819],
  ['Paracambi', 'Paracambi', 'Baixada Fluminense', -22.6108, -43.7108],
  ['Cachoeiras de Macacu', 'Cachoeiras de Macacu', 'Leste Fluminense', -22.4658, -42.6528],
  ['Petrópolis', 'Petrópolis', 'Região Serrana', -22.5050, -43.1789],
  ['Teresópolis', 'Teresópolis', 'Região Serrana', -22.4122, -42.9664],
  ['Nova Friburgo', 'Nova Friburgo', 'Região Serrana', -22.2819, -42.5310],
  ['Mangaratiba', 'Mangaratiba', 'Costa Verde', -22.9594, -44.0406],
  ['Araruama', 'Araruama', 'Região dos Lagos', -22.8728, -42.3431],
  ['Saquarema', 'Saquarema', 'Região dos Lagos', -22.9292, -42.5103],
  ['Cabo Frio', 'Cabo Frio', 'Região dos Lagos', -22.8894, -42.0286],
  ['Volta Redonda', 'Volta Redonda', 'Médio Paraíba', -22.5231, -44.1042],
  ['Macaé', 'Macaé', 'Norte Fluminense', -22.3708, -41.7869],
];

/** Grafias alternativas frequentes → nome oficial */
const ALIASES: Record<string, string> = {
  'meier': 'Méier', 'inhauma': 'Inhaúma', 'jardim botanico': 'Jardim Botânico', 'maracana': 'Maracanã',
  'recreio': 'Recreio dos Bandeirantes', 'barra': 'Barra da Tijuca', 'sulacap': 'Jardim Sulacap',
  'freguesia jacarepagua': 'Freguesia', 'freguesia (jacarepagua)': 'Freguesia', 'ilha': 'Ilha do Governador',
  'tomas coelho': 'Tomás Coelho', 'bras de pina': 'Brás de Pina', 'praca seca': 'Praça Seca',
  'quintino': 'Quintino Bocaiúva', 'engenho de dentro': 'Engenho de Dentro', 'complexo do alemao': 'Complexo do Alemão',
  'centro sao goncalo': 'São Gonçalo', 'rio': RJ, 'caxias': 'Duque de Caxias', 'sao joao': 'São João de Meriti',
  'meriti': 'São João de Meriti', 'nova iguacu': 'Nova Iguaçu', 'nilopolis': 'Nilópolis', 'niteroi': 'Niterói',
  'marica': 'Maricá', 'itaborai': 'Itaboraí', 'mage': 'Magé', 'seropedica': 'Seropédica', 'itaguai': 'Itaguaí',
  'petropolis': 'Petrópolis', 'teresopolis': 'Teresópolis', 'icarai': 'Icaraí', 'sg': 'São Gonçalo',
};

const mk = (r: Row, kind: Place['kind']): Place => ({ name: r[0], city: r[1], region: r[2], lat: r[3], lng: r[4], kind });

export const PLACES_NEIGHBORHOODS: Place[] = NEIGHBORHOODS.map((r) => mk(r, 'BAIRRO'));
export const PLACES_CITIES: Place[] = CITIES.map((r) => mk(r, 'MUNICIPIO'));

const byNorm = new Map<string, Place[]>();
for (const p of PLACES_NEIGHBORHOODS) {
  const k = normalize(p.name);
  byNorm.set(k, [...(byNorm.get(k) ?? []), p]);
}
const cityByNorm = new Map<string, Place>(PLACES_CITIES.map((c) => [normalize(c.name), c]));

function canonical(raw: string): string {
  const n = normalize(raw).replace(/[.;:]+$/g, '').replace(/\s*-\s*rj$/, '').trim();
  return ALIASES[n] ? normalize(ALIASES[n]) : n;
}

export function findCity(raw: string | null | undefined): Place | null {
  if (!raw) return null;
  return cityByNorm.get(canonical(raw)) ?? null;
}

/** Procura um bairro; se houver homônimos (ex.: Vista Alegre), usa a cidade para desempatar. */
export function findNeighborhood(raw: string | null | undefined, city?: string | null): Place | null {
  if (!raw) return null;
  let key = canonical(raw);
  // "Vista Alegre(Sao Goncalo)" / "Vista Alegre - São Gonçalo"
  const inner = key.match(/^(.+?)\s*[(\-–]\s*(.+?)\)?$/);
  let cityHint = city ?? null;
  if (inner && !byNorm.has(key)) {
    key = canonical(inner[1]);
    cityHint = cityHint ?? inner[2];
  }
  const list = byNorm.get(key);
  if (!list || list.length === 0) return null;
  if (list.length === 1) return list[0];
  const c = findCity(cityHint);
  return (c && list.find((p) => p.city === c.name)) || list.find((p) => p.city === RJ) || list[0];
}

/** Localiza um texto como bairro OU município. */
export function lookupPlace(raw: string | null | undefined, city?: string | null): Place | null {
  return findNeighborhood(raw, city) ?? findCity(raw);
}

export function regionOf(neighborhood: string | null, city: string | null): Region | null {
  return findNeighborhood(neighborhood, city)?.region ?? findCity(city)?.region ?? null;
}

/** Todos os nomes conhecidos (para reconhecer bairros/cidades dentro de textos livres). */
export const KNOWN_NAMES: { norm: string; place: Place }[] = [
  ...PLACES_NEIGHBORHOODS.map((p) => ({ norm: normalize(p.name), place: p })),
  ...PLACES_CITIES.map((p) => ({ norm: normalize(p.name), place: p })),
].sort((a, b) => b.norm.length - a.norm.length);

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
