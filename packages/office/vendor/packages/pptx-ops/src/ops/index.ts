// @ts-nocheck -- vendored from GenOffice（Apache-2.0）；不要手改，见 vendor/UPSTREAM.json
/* eslint-disable -- vendored，风格由上游决定 */
import './core-ops'
import './text-ops'
import './element-ops'
import './insert-ops'
import './table-ops'
import './slide-ops'
import './arrange-ops'
import './animation-ops'
import './equation-ops'
export { listSlideAnimations, type AnimationEntry } from './animation-ops'
export { equationRun } from './equation-ops'
export { runTxn, type TxnRequest, type TxnResult, type OpFailure } from './executor'
export { normalizeLengthUnits, parseLength } from './units'
export {
  elementDurableId,
  GuidedError,
  opNames,
  register,
  resolveGroupChildId,
  slideDurableId,
  type Op,
  type OpRecord,
  type OpTarget,
} from './registry'
