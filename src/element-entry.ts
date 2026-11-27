/** `import 'af-image-optimizer/element'` registers <image-optimizer>. */
import { defineImageOptimizer } from './integrations/element';

export { ImageOptimizerElement, defineImageOptimizer, type OptimizedEventDetail } from './integrations/element';

defineImageOptimizer();
