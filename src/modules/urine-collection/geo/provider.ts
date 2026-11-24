/**
 * Camada de geolocalização com provedor substituível.
 *
 * PADRÃO (ativo): "local-gazetteer" — usa apenas BAIRRO + CIDADE contra a base
 * local de bairros. Nenhum dado sai do navegador; a precisão é aproximada
 * (centro do bairro/município), suficiente para visão regional.
 *
 * Provedores externos (ex.: Nominatim/OpenStreetMap, Google, Mapbox) só devem ser
 * habilitados após avaliação de privacidade (LGPD), base legal e contrato. Mesmo
 * assim, envie o MÍNIMO necessário (nunca nome do paciente).
 */
import { findCity, findNeighborhood } from './gazetteer';

export interface GeoResult { lat: number; lng: number; precision: 'BAIRRO' | 'MUNICIPIO' | 'ENDERECO'; source: string }
export interface GeoInput { neighborhood: string | null; city: string | null; street?: string | null; number?: string | null; cep?: string | null }
export interface GeoProvider { id: string; label: string; sendsDataExternally: boolean; locate(input: GeoInput): Promise<GeoResult | null> }

export const localGazetteerProvider: GeoProvider = {
  id: 'local-gazetteer',
  label: 'Base local de bairros (aproximado, sem envio de dados)',
  sendsDataExternally: false,
  async locate({ neighborhood, city }) {
    const n = findNeighborhood(neighborhood, city);
    if (n && (!city || !findCity(city) || findCity(city)!.name === n.city)) {
      return { lat: n.lat, lng: n.lng, precision: 'BAIRRO', source: 'local-gazetteer' };
    }
    const c = findCity(city);
    if (c) return { lat: c.lat, lng: c.lng, precision: 'MUNICIPIO', source: 'local-gazetteer' };
    return null;
  },
};

/** Provedor em uso. Para trocar, implemente GeoProvider e altere aqui. */
export const activeGeoProvider: GeoProvider = localGazetteerProvider;
