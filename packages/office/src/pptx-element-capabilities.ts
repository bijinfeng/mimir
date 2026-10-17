import type { SlideElement } from '../vendor/packages/pptx-engine/src/types.js'
import { isConnectorPreset } from '../vendor/packages/pptx-render/src/preset-geometry.js'

/** Native lines are stroke-only; their invisible XML fill is deliberately absent in the model. */
export const pptxSupportsShapeFill = (element: SlideElement): boolean =>
  (element.type === 'shape' || element.type === 'text') &&
  !isConnectorPreset(element.presetGeometry)
