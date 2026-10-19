# Research: 已安装 AG-UI 附件转换往返验证

- Query: 不上传、不改产品、不加依赖，实际验证 toAgUiMessages/fromAgUiMessages 对 file URL、image 与附件身份的字段往返。
- Scope: internal；纯已安装编译转换函数，不是 HTTP、浏览器或 provider 验证。
- Date: 2026-10-19

## Findings

### 环境与复现

- Node v25.9.0；已安装 @assistant-ui/react-ag-ui 0.0.68（本地中断补丁保留），解析到 @assistant-ui/core 0.3.27。不是拟用React0.15.29/core0.3.29/AGUI0.0.70组合，不外推升级已验证。
- node --input-type=module 导入 ./packages/chat/node_modules/@assistant-ui/react-ag-ui/dist/runtime/adapter/conversions.js 的真实导出，无mock、无网络、无真实文件、无服务器/模型、无依赖安装。
- 源码 SHA256：0b97591ad8491f019f98226c2acaad236bad6ca8cd1363aa18536116b9c94799；compiled SHA256：c6666f7659338de2cf7dbe72cfc3e4934e46abdc9844fdaad1b8c3f7e2ca04f6。
- 对下方每个JSON input，依次执行 wire=toAgUiMessages(input), recovered=fromAgUiMessages(wire), rewire=toAgUiMessages(recovered)，比较两个wire；不能只看wireStable布尔值。

### 结果与实施合同

| Fixture | 观察 | 结论 |
| --- | --- | --- |
| document-relative-explicit-url | file sourceType:url → document source:url，往返保留路径/MIME/filename | 文件URL字段可往返；不证明URL鉴权或能下载 |
| document-absolute-url | 同上，绝对URL保留 | 可用于真实受保护原件引用 |
| image-absolute-url | image → image source:url，往返保留 | 图片使用经过宿主规范化的绝对同源HTTP(S)URL |
| image-relative-url | 相对路径被当source:data，恢复为data:image/png;base64,/api/... | **失败语义**；wireStable=true仍不是合法图片bytes，禁止此输入 |
| text-attachment | 附件text合并为问题字符串，恢复后无attachments | 不能用此形态保存附件身份/卡片；正文由服务器按canonical资源读取 |
| image-file-relative-explicit-url | 初次file+sourceType:url可变image source:url；恢复成image part，重出退为data | **往返不稳定**；首次转换成功不证明图片相对URL可用 |
| document-agui-metadata | providerMetadata.agui内serverAttachmentId/hash保留在wire metadata并恢复 | 只证明字段可携带；metadata仍不可信，服务器查归属/ready/hash |

所有非文本fixture原attachment.id=canonical-server-id在恢复后均变为序号0。不能把UI attachment.id当数据库资源身份。设计使用独立canonical serverAttachmentId/runConfig冻结引用并由服务器核验；可用受控providerMetadata作冗余映射，不能信任客户端声明或从文件名推身份。真实队列/历史/重试仍待HTTP验证。

绝对同源图片URL用于界面/协议表达。发provider前服务器按已验证资源读自身bytes，绝不自由fetch客户端URL，不将需Cookie的localhost URL交provider。URL由可信API根和资源ID构造。

### Files found / 源码锚点

- packages/chat/node_modules/@assistant-ui/react-ag-ui/src/runtime/adapter/conversions.ts:237–255：buildInputSource支持显式file sourceType:url；未指定且非HTTP/dataURL时走bytes分支。
- packages/chat/node_modules/@assistant-ui/react-ag-ui/src/runtime/adapter/conversions.ts:275–287：image调用buildInputSource(image,fallbackMimeType)，没有传sourceType。
- packages/chat/node_modules/@assistant-ui/react-ag-ui/src/runtime/adapter/conversions.ts:291–315：file读取data/mimeType/sourceType，按MIME输出document/image等。
- packages/chat/node_modules/@assistant-ui/react-ag-ui/src/runtime/adapter/conversions.ts:392–446：from按attachments.length重建id；image恢复image part，document恢复file+sourceType:url。
- packages/chat/node_modules/@assistant-ui/react-ag-ui/src/runtime/adapter/conversions.ts:449–486：合并content与attachments，纯text压平成字符串。
- packages/chat/node_modules/@assistant-ui/react-ag-ui/dist/runtime/adapter/conversions.js：本次实际执行的编译函数。

### External references / Related specs

复核父研究chat-attachment-planning.md的WeKnora官网与固定源证据：v0.8.3，commit 2c0d8384398ca756ee414eef01b71caf91e2caa6；frontend/src/api/chat/temporary-attachments.ts:7,17,25–56有session_id、expires_at和会话内upload/get/preview/delete，temporary_document_prompt.go:45–56核验同会话+ready。适用独立资源/服务器核验；WeKnora不使用此转换器，不能证明本url/provider兼容。具体源码SHA沿父研究，不将线上版本等同已知部署SHA。

相关规范：.trellis/spec/chat/frontend/conventions.md、pitfalls.md的队列/历史/截图与中断桥；.trellis/spec/server/backend/auth.md的受保护资源；父任务R9–R11。

### 实测完整JSON（七fixtures）

~~~json
[
  {
    "label": "document-relative-explicit-url",
    "input": [
      {
        "id": "message-1",
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "问题"
          }
        ],
        "attachments": [
          {
            "id": "canonical-server-id",
            "type": "document",
            "name": "说明.txt",
            "contentType": "text/plain",
            "status": {
              "type": "complete"
            },
            "content": [
              {
                "type": "file",
                "filename": "说明.txt",
                "mimeType": "text/plain",
                "data": "/api/conversations/c/attachments/a/file",
                "sourceType": "url"
              }
            ]
          }
        ]
      }
    ],
    "wire": [
      {
        "id": "message-1",
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "问题"
          },
          {
            "type": "document",
            "source": {
              "type": "url",
              "value": "/api/conversations/c/attachments/a/file",
              "mimeType": "text/plain"
            },
            "metadata": {
              "filename": "说明.txt"
            }
          }
        ]
      }
    ],
    "recovered": [
      {
        "id": "message-1",
        "role": "user",
        "content": "问题",
        "attachments": [
          {
            "id": "0",
            "type": "document",
            "name": "说明.txt",
            "contentType": "text/plain",
            "status": {
              "type": "complete"
            },
            "content": [
              {
                "type": "file",
                "data": "/api/conversations/c/attachments/a/file",
                "mimeType": "text/plain",
                "sourceType": "url",
                "filename": "说明.txt"
              }
            ]
          }
        ]
      }
    ],
    "rewire": [
      {
        "id": "message-1",
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "问题"
          },
          {
            "type": "document",
            "source": {
              "type": "url",
              "value": "/api/conversations/c/attachments/a/file",
              "mimeType": "text/plain"
            },
            "metadata": {
              "filename": "说明.txt"
            }
          }
        ]
      }
    ],
    "wireStable": true
  },
  {
    "label": "document-absolute-url",
    "input": [
      {
        "id": "message-1",
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "问题"
          }
        ],
        "attachments": [
          {
            "id": "canonical-server-id",
            "type": "document",
            "name": "说明.txt",
            "contentType": "text/plain",
            "status": {
              "type": "complete"
            },
            "content": [
              {
                "type": "file",
                "filename": "说明.txt",
                "mimeType": "text/plain",
                "data": "http://127.0.0.1:5185/api/conversations/c/attachments/a/file",
                "sourceType": "url"
              }
            ]
          }
        ]
      }
    ],
    "wire": [
      {
        "id": "message-1",
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "问题"
          },
          {
            "type": "document",
            "source": {
              "type": "url",
              "value": "http://127.0.0.1:5185/api/conversations/c/attachments/a/file",
              "mimeType": "text/plain"
            },
            "metadata": {
              "filename": "说明.txt"
            }
          }
        ]
      }
    ],
    "recovered": [
      {
        "id": "message-1",
        "role": "user",
        "content": "问题",
        "attachments": [
          {
            "id": "0",
            "type": "document",
            "name": "说明.txt",
            "contentType": "text/plain",
            "status": {
              "type": "complete"
            },
            "content": [
              {
                "type": "file",
                "data": "http://127.0.0.1:5185/api/conversations/c/attachments/a/file",
                "mimeType": "text/plain",
                "sourceType": "url",
                "filename": "说明.txt"
              }
            ]
          }
        ]
      }
    ],
    "rewire": [
      {
        "id": "message-1",
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "问题"
          },
          {
            "type": "document",
            "source": {
              "type": "url",
              "value": "http://127.0.0.1:5185/api/conversations/c/attachments/a/file",
              "mimeType": "text/plain"
            },
            "metadata": {
              "filename": "说明.txt"
            }
          }
        ]
      }
    ],
    "wireStable": true
  },
  {
    "label": "image-absolute-url",
    "input": [
      {
        "id": "message-1",
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "问题"
          }
        ],
        "attachments": [
          {
            "id": "canonical-server-id",
            "type": "image",
            "name": "图片.png",
            "contentType": "image/png",
            "status": {
              "type": "complete"
            },
            "content": [
              {
                "type": "image",
                "image": "http://127.0.0.1:5185/api/conversations/c/attachments/a/file",
                "filename": "图片.png"
              }
            ]
          }
        ]
      }
    ],
    "wire": [
      {
        "id": "message-1",
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "问题"
          },
          {
            "type": "image",
            "source": {
              "type": "url",
              "value": "http://127.0.0.1:5185/api/conversations/c/attachments/a/file",
              "mimeType": "image/png"
            },
            "metadata": {
              "filename": "图片.png"
            }
          }
        ]
      }
    ],
    "recovered": [
      {
        "id": "message-1",
        "role": "user",
        "content": "问题",
        "attachments": [
          {
            "id": "0",
            "type": "image",
            "name": "图片.png",
            "contentType": "image/png",
            "status": {
              "type": "complete"
            },
            "content": [
              {
                "type": "image",
                "image": "http://127.0.0.1:5185/api/conversations/c/attachments/a/file",
                "filename": "图片.png"
              }
            ]
          }
        ]
      }
    ],
    "rewire": [
      {
        "id": "message-1",
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "问题"
          },
          {
            "type": "image",
            "source": {
              "type": "url",
              "value": "http://127.0.0.1:5185/api/conversations/c/attachments/a/file",
              "mimeType": "image/png"
            },
            "metadata": {
              "filename": "图片.png"
            }
          }
        ]
      }
    ],
    "wireStable": true
  },
  {
    "label": "image-relative-url",
    "input": [
      {
        "id": "message-1",
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "问题"
          }
        ],
        "attachments": [
          {
            "id": "canonical-server-id",
            "type": "image",
            "name": "图片.png",
            "contentType": "image/png",
            "status": {
              "type": "complete"
            },
            "content": [
              {
                "type": "image",
                "image": "/api/conversations/c/attachments/a/file",
                "filename": "图片.png"
              }
            ]
          }
        ]
      }
    ],
    "wire": [
      {
        "id": "message-1",
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "问题"
          },
          {
            "type": "image",
            "source": {
              "type": "data",
              "value": "/api/conversations/c/attachments/a/file",
              "mimeType": "image/png"
            },
            "metadata": {
              "filename": "图片.png"
            }
          }
        ]
      }
    ],
    "recovered": [
      {
        "id": "message-1",
        "role": "user",
        "content": "问题",
        "attachments": [
          {
            "id": "0",
            "type": "image",
            "name": "图片.png",
            "contentType": "image/png",
            "status": {
              "type": "complete"
            },
            "content": [
              {
                "type": "image",
                "image": "data:image/png;base64,/api/conversations/c/attachments/a/file",
                "filename": "图片.png"
              }
            ]
          }
        ]
      }
    ],
    "rewire": [
      {
        "id": "message-1",
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "问题"
          },
          {
            "type": "image",
            "source": {
              "type": "data",
              "value": "/api/conversations/c/attachments/a/file",
              "mimeType": "image/png"
            },
            "metadata": {
              "filename": "图片.png"
            }
          }
        ]
      }
    ],
    "wireStable": true
  },
  {
    "label": "text-attachment",
    "input": [
      {
        "id": "message-1",
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "问题"
          }
        ],
        "attachments": [
          {
            "id": "canonical-server-id",
            "type": "document",
            "name": "说明.txt",
            "contentType": "text/plain",
            "status": {
              "type": "complete"
            },
            "content": [
              {
                "type": "text",
                "text": "fixture extracted text"
              }
            ]
          }
        ]
      }
    ],
    "wire": [
      {
        "id": "message-1",
        "role": "user",
        "content": "问题\nfixture extracted text"
      }
    ],
    "recovered": [
      {
        "id": "message-1",
        "role": "user",
        "content": "问题\nfixture extracted text"
      }
    ],
    "rewire": [
      {
        "id": "message-1",
        "role": "user",
        "content": "问题\nfixture extracted text"
      }
    ],
    "wireStable": true
  },
  {
    "label": "image-file-relative-explicit-url",
    "input": [
      {
        "id": "message-1",
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "问题"
          }
        ],
        "attachments": [
          {
            "id": "canonical-server-id",
            "type": "image",
            "name": "图片.png",
            "contentType": "image/png",
            "status": {
              "type": "complete"
            },
            "content": [
              {
                "type": "file",
                "mimeType": "image/png",
                "data": "/api/conversations/c/attachments/a/file",
                "sourceType": "url",
                "filename": "图片.png"
              }
            ]
          }
        ]
      }
    ],
    "wire": [
      {
        "id": "message-1",
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "问题"
          },
          {
            "type": "image",
            "source": {
              "type": "url",
              "value": "/api/conversations/c/attachments/a/file",
              "mimeType": "image/png"
            },
            "metadata": {
              "filename": "图片.png"
            }
          }
        ]
      }
    ],
    "recovered": [
      {
        "id": "message-1",
        "role": "user",
        "content": "问题",
        "attachments": [
          {
            "id": "0",
            "type": "image",
            "name": "图片.png",
            "contentType": "image/png",
            "status": {
              "type": "complete"
            },
            "content": [
              {
                "type": "image",
                "image": "/api/conversations/c/attachments/a/file",
                "filename": "图片.png"
              }
            ]
          }
        ]
      }
    ],
    "rewire": [
      {
        "id": "message-1",
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "问题"
          },
          {
            "type": "image",
            "source": {
              "type": "data",
              "value": "/api/conversations/c/attachments/a/file",
              "mimeType": "image/png"
            },
            "metadata": {
              "filename": "图片.png"
            }
          }
        ]
      }
    ],
    "wireStable": false
  },
  {
    "label": "document-agui-metadata",
    "input": [
      {
        "id": "message-1",
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "问题"
          }
        ],
        "attachments": [
          {
            "id": "canonical-server-id",
            "type": "document",
            "name": "说明.txt",
            "contentType": "text/plain",
            "status": {
              "type": "complete"
            },
            "content": [
              {
                "type": "file",
                "filename": "说明.txt",
                "mimeType": "text/plain",
                "data": "http://127.0.0.1:5185/api/conversations/c/attachments/a/file",
                "sourceType": "url",
                "providerMetadata": {
                  "agui": {
                    "serverAttachmentId": "canonical-server-id",
                    "contentHash": "fixture-only"
                  }
                }
              }
            ]
          }
        ]
      }
    ],
    "wire": [
      {
        "id": "message-1",
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "问题"
          },
          {
            "type": "document",
            "source": {
              "type": "url",
              "value": "http://127.0.0.1:5185/api/conversations/c/attachments/a/file",
              "mimeType": "text/plain"
            },
            "metadata": {
              "serverAttachmentId": "canonical-server-id",
              "contentHash": "fixture-only",
              "filename": "说明.txt"
            }
          }
        ]
      }
    ],
    "recovered": [
      {
        "id": "message-1",
        "role": "user",
        "content": "问题",
        "attachments": [
          {
            "id": "0",
            "type": "document",
            "name": "说明.txt",
            "contentType": "text/plain",
            "status": {
              "type": "complete"
            },
            "content": [
              {
                "type": "file",
                "data": "http://127.0.0.1:5185/api/conversations/c/attachments/a/file",
                "mimeType": "text/plain",
                "sourceType": "url",
                "filename": "说明.txt",
                "providerMetadata": {
                  "agui": {
                    "serverAttachmentId": "canonical-server-id",
                    "contentHash": "fixture-only"
                  }
                }
              }
            ]
          }
        ]
      }
    ],
    "rewire": [
      {
        "id": "message-1",
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "问题"
          },
          {
            "type": "document",
            "source": {
              "type": "url",
              "value": "http://127.0.0.1:5185/api/conversations/c/attachments/a/file",
              "mimeType": "text/plain"
            },
            "metadata": {
              "serverAttachmentId": "canonical-server-id",
              "contentHash": "fixture-only",
              "filename": "说明.txt"
            }
          }
        ]
      }
    ],
    "wireStable": true
  }
]
~~~

## Caveats / Not Found

- 仅纯转换字段，不证明HTTP鉴权/可读性、Content-Disposition、浏览器媒体/文件选择、provider视觉和模型理解。
- 未挂载Thread、未执行AttachmentAdapter add/remove/send、queue/steer/Agent桥或数据库历史。待具体HTML获批后实现验证。
- 全部fixture是本地构造数据；无上传、无模型/工具、无产品/依赖改动。
