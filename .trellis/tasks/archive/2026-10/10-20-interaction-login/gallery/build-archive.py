from pathlib import Path
import hashlib, json, re, subprocess
from PIL import Image
repo=Path(subprocess.check_output(['git','rev-parse','--show-toplevel'],text=True).strip())
p=repo/'docs/visual-comparisons/2026-10-20-login'
labels={
'login-light':'登录 · 浅色','login-dark':'登录 · 深色','signup-light':'首次创建账号 · 浅色','signup-phone':'首次创建 · 390×700','signup-short':'首次创建 · 1100×420','loading':'初始化加载','setup-error-light':'初始化连接失败 · 浅色','setup-error-dark':'初始化连接失败 · 深色600','local-browser':'本地模式 · 浏览器提示','local-desktop':'本地模式 · 桌面插槽模拟','root-offline-wide':'连接失败 · 1440×900','root-offline-medium':'连接失败 · 深色1100×760','root-offline-compact':'连接失败 · 880×760','root-offline-narrow':'连接失败 · 深色600×760','root-offline-phone':'连接失败 · 390×700','root-offline-short':'连接失败 · 深色1100×420','root-http':'HTTP 故障恢复','root-desktop':'故障恢复 · 桌面插槽','load-error':'共享读取失败 · 窄容器','login-required':'登录必填校验','login-password-visible':'密码显隐','auth-error':'认证失败 · 草稿保留','long-error':'长错误信息','pending':'登录提交中','pending-second-enter':'等待时再次 Enter · 仍1个请求','login-success':'模拟登录成功与跳转','signup-required':'首次创建必填校验','signup-mismatch':'两次密码不一致','signup-pending':'首次创建提交中 · 模拟IO','signup-success':'模拟创建成功与跳转','setup-error-retrying':'初始化失败后重试','setup-error-recovered':'初始化重试恢复','root-offline-retrying':'连接失败后重试等待','root-offline-recovered':'连接重试成功恢复','desktop-fallback-invoked':'桌面恢复入口调用 · 模拟桥','root-retry-failed':'重试再次失败 · 恢复可操作','root-repeated-pending':'再次重试等待 · 跨错误边界','root-repeated-recovered':'再次重试成功恢复'}
first=['root-offline-wide','root-repeated-pending','setup-error-light','root-offline-phone','root-offline-short','root-desktop']
scenes=[]
all_names={f.stem for s in ['before','after'] for f in (p/s).glob('*.png')}
for name in first+sorted(all_names-set(first)):
 row={'id':name,'label':labels.get(name,name),'kind':'真实组件 / 模拟 IO','note':'真实产品组件及根路由；只替换 IO。相同内容、场景、尺寸；未改动的表单保留原样。原生窗口与实际注册不由此模拟验收。'}
 if name.startswith('login-dark-') or name=='product-authenticated':
  row.update(kind='真实应用 / 本地测试服务',note='真实服务渲染的补充证据。使用标准测试账号验证登录成功；此补充项没有前后配对，不据此宣称视觉差异。')
 for side in ['before','after']:
  f=p/side/f'{name}.png'
  if f.exists():row[side]=f'{side}/{name}.png'
 if 'before' in row and 'after' in row:assert Image.open(p/row['before']).size==Image.open(p/row['after']).size,name
 scenes.append(row)
base=(repo/'docs/visual-comparisons/2026-10-20-settings/comparison.html').read_text()
base=base.replace('设置交互精修','登录与故障恢复精修')
base=re.sub(r'<p>2026-10-20 · 基线.*?</p>', '<p>2026-10-20 · 基线 ad72328 · 38组同尺寸前后对比，另含真实应用补充证据。</p>',base,flags=re.S)
base=re.sub(r'<p>\s*重点：.*?</p>', '<p>重点：居中且可滚动的恢复页、中文恢复指引、连续重试等待反馈、桌面恢复入口。登录与注册沿用现有布局，保留认证与跳转合同。</p><p><a href="demo/dist/before/index.html?scene=root-offline">操作修改前 Demo</a> · <a href="demo/dist/after/index.html?scene=root-offline">操作修改后 Demo</a> · <a href="demo/dist/after/index.html?scene=signup">首次创建模拟</a></p>',base,flags=re.S)
base=re.sub(r'<ul>.*?</ul>', '<ul><li>真实路由与组件覆盖已有登录、首次创建、本地模式、初始化等待/失败、网络/HTTP故障及恢复。</li><li>模拟IO交互含必填/密码确认、显隐、认证失败保稿、pending重复Enter、连续失败后再次等待与成功、Desktop桥调用。</li><li>实际服务已使用标准测试账号登录并进入知识库；未创建第二账号、改密码或改认证配置。Electron窗口与实际首次注册未验。</li><li>38组配对均核对原始PNG尺寸，实际视口1440/1100/880/600/390及短窗口，布局记录见layout-metrics.json。</li><li>完整质量门结果见验收记录和日志。</li></ul>',base,count=1,flags=re.S)
base=re.sub(r'const scenes = \[.*?\n      \]\n      const select', 'const scenes = '+json.dumps(scenes,ensure_ascii=False,indent=2)+'\n      const select',base,flags=re.S)
base=base.replace("if (mode === 'before' && !scene.before) mode = 'after'", "if (mode === 'before' && !scene.before) mode = 'after'\n        if (mode === 'after' && !scene.after) mode = 'before'")
base=base.replace("mode !== 'compare' || !scene.before", "mode !== 'compare' || !scene.before || !scene.after")
base=base.replace("button.disabled = button.dataset.mode === 'before' && !scene.before", "button.disabled = (button.dataset.mode === 'before' && !scene.before) || (button.dataset.mode === 'after' && !scene.after)")
base=base.replace('此页可离线打开，不依赖开发服务器。模拟演示源码随Trellis任务归档，运行方式见任务gallery/README.md。','截图对比可离线打开。交互Demo已编译保存，使用任意本地静态HTTP服务打开；只模拟IO，不连接真实服务。可切换场景；完成/失败按钮推进可控请求。')
(p/'comparison.html').write_text(base)
files=[]
for s in ['before','after']:
 for f in sorted((p/s).glob('*.png')):
  im=Image.open(f);assert im.format=='PNG'
  files.append({'path':str(f.relative_to(p)),'width':im.width,'height':im.height,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()})
source_files=['packages/renderer/src/routes/__root.tsx','packages/renderer/src/routes/login.tsx']
manifest={'date':'2026-10-20','baseline':'ad72328','pairedScenes':38,'images':files,'scenes':scenes,'sources':{f:hashlib.sha256((repo/f).read_bytes()).hexdigest() for f in source_files},'references':{'WeKnora':'v0.8.3','treeSha':'3e22822c1d2397be730c458c7539d0eb8c113a24'},'demo':'demo/dist/{before,after}/index.html; real source, simulated IO; built with gallery/vite.config.mjs'}
(p/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(len(files),'PNG;',len(scenes),'scenes;',38,'pairs; dimensions matched')
