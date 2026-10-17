# 原始音视频真实浏览器前处理验收

2026-10-17 root，CUA同一IAB浏览器tab34。临时本地5185页面直接导入当前生产`packages/renderer/src/lib/docx-media.ts`，真实File/HTMLVideoElement/Canvas/AudioContext/FileReader；未请求模型、未写知识库。harness说明及fixture SHA见`/tmp/mimir-agent-media-codec-harness-20261017/README.md`。

## 实际结果

- 真实4秒1920×1080 H264+48k AAC视频，PPTX默认与DOCX模式均输出4张1280×720 JPEG，seek时间0.40/1.40/2.60/3.60秒。PPTX默认无音轨，未创建AudioContext。
- PPTX includeAudio=true输出相同4帧及128044字节RIFF/WAVE：PCM1、mono、16000Hz、16bits、data128000字节、duration4s，SHA aac02d63ae58daa9b5a4328220cb590e4578ba238a5338ceccbba47ef0913577。真实decodeAudioData调用/完成与AudioContext closed都有事件。
- 原始WAV输出SHA与原件一致：2566aa20c89803b761c98b82e15ae863a5b04b58ee3d58730252b6c88e1aa128；真实FileReader完成，未创建视频/AudioContext。
- 首次真实seeked后停止、真实decodeAudioData开始后停止、真实FileReader读取开始后停止，均显示已停止/媒体分析已停止，无输出。已分配BlobURL全部回收；解码停止AudioContext closed；读取停止aborted=true/loadend=true。
- 调用前取消零FileReader/视频/BlobURL/AudioContext。取消后重试WAV成功。

实际DOM证据为`/tmp/mimir-media-codec-{default,audio,seek-stop,decode-stop,docx,wav,read-stop,pre-stop}-browser-20261017.txt`。资源回收后video节点src已移除、readyState0；Chromium观测currentSrc仍保留历史blob字符串，不能声称currentSrc为空。没有活跃URL。

本报告只证明本地生产前处理及停止回收，不证明真实供应商、整个Agent端到端或产品页布局。临时harness不作为产品样式证据。
