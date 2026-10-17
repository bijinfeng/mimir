import {
  checkDocxPasswordInWorker,
  createDocxPasswordInWorker,
  type DocxPasswordCredential,
} from './docx-protection-password-crypto.js'
const scope = globalThis as unknown as {
  addEventListener(
    type: 'message',
    listener: (
      event: MessageEvent<{
        password: string
        credential?: DocxPasswordCredential
        create?: boolean
      }>,
    ) => void,
    options: { once: boolean },
  ): void
  postMessage(
    message: { matches?: boolean; credential?: DocxPasswordCredential; error?: boolean },
    transfer: Transferable[],
  ): void
}
scope.addEventListener(
  'message',
  async ({ data }) => {
    try {
      if (data.create === true) {
        const credential = await createDocxPasswordInWorker(data.password)
        scope.postMessage({ credential }, [])
      } else {
        const matches = await checkDocxPasswordInWorker(data.password, data.credential!)
        scope.postMessage({ matches }, [])
      }
    } catch {
      // No input, hash, salt or platform exception crosses back into the UI.
      scope.postMessage({ error: true }, [])
    }
  },
  { once: true },
)
