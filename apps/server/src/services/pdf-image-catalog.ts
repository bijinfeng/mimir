const page = { type: 'integer', minimum: 1 }
const dimension = { type: 'number', exclusiveMinimum: 0 }
const geometry = {
  x: { type: 'number', minimum: 0 },
  y: { type: 'number', minimum: 0 },
  width: dimension,
  height: dimension,
  layer: { type: 'string', enum: ['above_text', 'below_text'] },
}
const target = { page, image_number: { type: 'integer', minimum: 1 } }
const url = { type: 'string', format: 'uri', maxLength: 2000 }
const fraction = { type: 'number', minimum: 0, maximum: 1 }
const selection =
  '先 list_page_images；page、image_number 使用本页最近读取的序号。复用资源、重叠目标、嵌套图片或不安全文档结构会拒绝。'
export const pdfImageTools = [
  {
    name: 'list_page_images',
    description:
      '读取当前工作字节中的图片、页内序号、显示方向左上角起算的pt位置和尺寸、可编辑状态及原因。省略page读取全部页面。',
    inputSchema: { type: 'object', properties: { page } },
  },
  {
    name: 'insert_image',
    description:
      '下载PNG/JPEG URL并插入页面。位置使用唯一完整原文anchor_text和placement，或显示方向左上角pt坐标；省略时居中。宽高只给一项时保留比例。用户手动保存。',
    inputSchema: {
      type: 'object',
      required: ['page', 'url'],
      properties: {
        page,
        url,
        ...geometry,
        anchor_text: { type: 'string', minLength: 1, maxLength: 10000 },
        placement: { type: 'string', enum: ['below', 'above', 'right', 'left'] },
      },
    },
  },
  {
    name: 'transform_image',
    description: `移动、缩放图片或调整文字上/下层次。只给宽或高时保留比例，省略项保持原值。${selection}`,
    inputSchema: {
      type: 'object',
      required: ['page', 'image_number'],
      properties: { ...target, ...geometry },
    },
  },
  {
    name: 'rotate_image',
    description: `围绕图片中心旋转四分之一周或半周，90度时交换显示宽高。${selection}`,
    inputSchema: {
      type: 'object',
      required: ['page', 'image_number'],
      properties: { ...target, direction: { type: 'string', enum: ['cw', 'ccw', '180'] } },
    },
  },
  {
    name: 'replace_image',
    description: `以PNG/JPEG URL替换图片像素，保留位置、尺寸、层次和已设置的不透明度。${selection}`,
    inputSchema: {
      type: 'object',
      required: ['page', 'image_number', 'url'],
      properties: { ...target, url },
    },
  },
  {
    name: 'flip_image',
    description: `按显示方向水平或垂直翻转图片像素。像素处理最大边2400px，任意角度/倾斜/镜像矩阵暂不支持。${selection}`,
    inputSchema: {
      type: 'object',
      required: ['page', 'image_number', 'axis'],
      properties: { ...target, axis: { type: 'string', enum: ['horizontal', 'vertical'] } },
    },
  },
  {
    name: 'set_image_opacity',
    description: `设置图片绝对不透明度0–1，可从0恢复为1，重复设置不会累乘。${selection}`,
    inputSchema: {
      type: 'object',
      required: ['page', 'image_number', 'opacity'],
      properties: { ...target, opacity: fraction },
    },
  },
  {
    name: 'crop_image',
    description: `按显示方向裁去图片四侧比例（0–1，省略为0），缩小页面占位并保留剩余像素的位置。像素处理最大边2400px。${selection}`,
    inputSchema: {
      type: 'object',
      required: ['page', 'image_number'],
      properties: { ...target, left: fraction, top: fraction, right: fraction, bottom: fraction },
    },
  },
  {
    name: 'remove_image_background',
    description: `去除与边缘连通的纯色背景并设为透明，容差0–100默认30，像素处理最大边2400px。${selection}`,
    inputSchema: {
      type: 'object',
      required: ['page', 'image_number'],
      properties: { ...target, tolerance: { type: 'number', minimum: 0, maximum: 100 } },
    },
  },
  {
    name: 'delete_image',
    description: `删除所选图片，可在保存前撤销本轮Agent改动。${selection}`,
    inputSchema: { type: 'object', required: ['page', 'image_number'], properties: target },
  },
]
