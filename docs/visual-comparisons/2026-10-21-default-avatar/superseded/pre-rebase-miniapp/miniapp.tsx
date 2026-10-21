/** Real account fragments and native UserAvatar, using the documented Image/View DOM adapter. */
import { createRoot } from 'react-dom/client'
import {
  Profile as BeforeProfile,
  HeadAccountRow as BeforeRow,
} from './source-fragments/miniapp-before'
import {
  Profile as AfterProfile,
  HeadAccountRow as AfterRow,
} from './source-fragments/miniapp-after'
import './source-fragments/miniapp-shared.scss'
import '../../../apps/miniapp/node_modules/@nutui/nutui-react-taro/dist/es/packages/avatar/style/style.css'
const after = new URLSearchParams(location.search).get('stage') === 'after'
const Profile = after ? AfterProfile : BeforeProfile
const Row = after ? AfterRow : BeforeRow
createRoot(document.getElementById('root')!).render(
  <main className="page" style={{ width: 390 }}>
    <h1 style={{ fontSize: 19, margin: '0 0 20px' }}>小程序账号 · 源码片段</h1>
    <p style={{ margin: '0 0 8px' }}>当前工作树资料卡 · 48px</p>
    <Profile />
    <p style={{ margin: '24px 0 8px' }}>独立提交版本账号行 · 32px</p>
    <Row />
    <p style={{ marginTop: 24, color: '#595959', fontSize: 12 }}>
      Image / View 使用 DOM 适配器，仅核对源码与本地图片，微信设备效果待验。
    </p>
  </main>,
)
