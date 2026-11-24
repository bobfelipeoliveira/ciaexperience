/** Módulos instalados na plataforma. Novos módulos entram nesta lista. */
import type { PlatformModule } from '../core/modules';
import { urineCollectionModule } from './urine-collection';

export const MODULES: PlatformModule[] = [urineCollectionModule];
