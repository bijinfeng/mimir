/** Current HEAD profile JSX and native UserAvatar with an explicit Image/View DOM adapter. */
import { createRoot } from 'react-dom/client'
import { Profile as BeforeProfile } from './source-fragments/miniapp-before'
import { Profile as AfterProfile } from './source-fragments/miniapp-after'
import './source-fragments/miniapp-shared.scss'
const after = new URLSearchParams(location.search).get('stage') === 'after'
const Profile = after ? AfterProfile : BeforeProfile
createRoot(document.getElementById('root')!).render(
  <main className="page" style={{ width: 390, boxSizing: 'border-box' }}>
    <h1 className="page-title" style={{ margin: '0 0 16px' }}>
      我的
    </h1>
    <Profile />
    <p style={{ marginTop: 24, color: '#595959', fontSize: 12 }}>
      实际48px账号资料卡。Image / View 使用 DOM 适配器，仅核对源码与本地图片，微信设备效果待验。
    </p>
  </main>,
)
