import { app } from './src/test/helpers.ts'

const cookie = (res) => {
  const raw = res.headers.getSetCookie?.() ?? []
  return raw.map((e) => e.split(';')[0]).join('; ')
}

// 先确保有测试用户
const signIn = await app.request('/api/auth/sign-in/email', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@example.com', password: '12345678' }),
})
if (signIn.status !== 200) {
  const signUp = await app.request('/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.com', password: '12345678', name: 'admin' }),
  })
  console.log('signup status:', signUp.status)
}

console.log('--- 1. 用邮箱登录 ---')
const r1 = await app.request('/api/auth/sign-in/identifier', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ identifier: 'admin@example.com', password: '12345678' }),
})
console.log('status:', r1.status, 'has cookie:', !!cookie(r1))

console.log('--- 2. 用用户名登录 ---')
const r2 = await app.request('/api/auth/sign-in/identifier', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ identifier: 'admin', password: '12345678' }),
})
console.log('status:', r2.status, 'has cookie:', !!cookie(r2))

console.log('--- 3. 错误密码 ---')
const r3 = await app.request('/api/auth/sign-in/identifier', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ identifier: 'admin', password: 'wrong-password' }),
})
console.log('status:', r3.status)

console.log('--- 4. 不存在的用户名 ---')
const r4 = await app.request('/api/auth/sign-in/identifier', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ identifier: 'nobody', password: '12345678' }),
})
console.log('status:', r4.status)

console.log('--- 5. 缺少密码 ---')
const r5 = await app.request('/api/auth/sign-in/identifier', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ identifier: 'admin' }),
})
console.log('status:', r5.status)

console.log('--- 6. 邮箱大小写 ---')
const r6 = await app.request('/api/auth/sign-in/identifier', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ identifier: 'Owner@Example.com', password: '12345678' }),
})
console.log('status:', r6.status, 'has cookie:', !!cookie(r6))
