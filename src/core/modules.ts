/**
 * CONTRATO DE MÓDULO DA PLATAFORMA
 * Cada módulo (Coletas de Urina, Remoções, Rotas, Materiais…) se registra aqui
 * com suas rotas, menu e provedor de dados — sem tocar nos demais módulos.
 * Para criar um novo módulo: copie a pasta src/modules/urine-collection como
 * referência, crie suas tabelas com prefixo próprio no banco e adicione-o em
 * src/modules/index.ts.
 */
import type { ComponentType, LazyExoticComponent, ReactNode } from 'react';
import type { IconName } from './components/Icon';
import type { Role } from './auth/AuthProvider';

export interface ModuleMenuItem {
  to: string;
  label: string;
  icon: IconName;
  /** Papéis do módulo que veem o item (admin vê tudo). Vazio = todos do módulo. */
  roles?: Role[];
  adminOnly?: boolean;
  end?: boolean;
  /** Chave de contador (ex.: alertas) fornecida por useBadges */
  badge?: string;
}

export interface ModuleRoute {
  path: string;
  element: LazyExoticComponent<ComponentType> | ComponentType;
  roles?: Role[];
  adminOnly?: boolean;
}

export interface PlatformModule {
  key: string;            // igual à coluna modules.key no banco
  name: string;           // nome exibido
  headerLabel: string;    // "MÓDULO: COLETAS DE URINA"
  menu: ModuleMenuItem[];
  routes: ModuleRoute[];
  /** Provedor de dados compartilhado entre as telas do módulo */
  Provider?: ComponentType<{ children: ReactNode }>;
  /** Contadores para o menu (ex.: número de alertas) */
  useBadges?: () => Record<string, number>;
}
