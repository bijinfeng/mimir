import { createStyles } from 'antd-style'
import { FONT_SIZE } from '../../theme/tokens'

/** Display sizes belong only to the public site; workspace typography is unchanged. */
const DISPLAY = FONT_SIZE.display * 2.2
const SECTION = FONT_SIZE.display * 1.3

export const useSiteStyles = createStyles(({ css, token }) => ({
  page: css`
    height: 100%;
    overflow: auto;
    background: ${token.surfaceContent};
    color: ${token.colorText};
    font-size: ${FONT_SIZE.reading}px;
    line-height: 1.8;
    scrollbar-color: ${token.colorBorder} ${token.surfaceContent};
    & ::selection {
      background: ${token.colorPrimaryBg};
      color: ${token.colorText};
    }
    & a {
      text-underline-offset: 4px;
    }
    & a:focus-visible,
    & button:focus-visible,
    & [tabindex='-1']:focus-visible {
      outline: 2px solid ${token.focusRing};
      outline-offset: 4px;
    }
    & section[id],
    & main[id] {
      scroll-margin-top: 28px;
    }
    & h1,
    & h2,
    & h3,
    & p {
      margin: 0;
    }
    & h1,
    & h2,
    & h3 {
      color: ${token.colorText};
      text-wrap: balance;
    }
    & h2 {
      font-size: ${SECTION}px;
      line-height: 1.35;
      letter-spacing: -0.025em;
    }
    & h3 {
      font-size: ${FONT_SIZE.settingsTitle}px;
      line-height: 1.5;
    }
    & p {
      color: ${token.colorTextSecondary};
    }
    @media (max-width: 700px) {
      & h2 {
        font-size: ${FONT_SIZE.display}px;
      }
    }
  `,
  container: css`
    width: min(1200px, calc(100% - 96px));
    margin-inline: auto;
    @media (max-width: 700px) {
      width: calc(100% - 40px);
    }
  `,
  skip: css`
    position: absolute;
    top: 12px;
    left: 20px;
    z-index: 10;
    padding: 8px 16px;
    background: ${token.surfaceContent};
    color: ${token.colorLink};
    transform: translateY(-200%);
    &:focus {
      transform: none;
    }
  `,
  header: css`
    border-bottom: 1px solid ${token.colorBorderSecondary};
  `,
  nav: css`
    min-height: 88px;
    display: flex;
    align-items: center;
    gap: 32px;
    & > a:not(:first-child) {
      color: ${token.colorTextSecondary};
      font-size: ${FONT_SIZE.body}px;
    }
    & > a:hover {
      color: ${token.colorLink};
    }
    @media (max-width: 700px) {
      min-height: 72px;
      gap: 16px;
      & > a[data-secondary] {
        display: none;
      }
    }
  `,
  brand: css`
    display: inline-flex;
    align-items: center;
    gap: 10px;
    margin-right: auto;
    color: ${token.colorText};
    font-size: ${FONT_SIZE.display}px;
    letter-spacing: -0.02em;
    line-height: 1;
    & b {
      font-weight: 650;
    }
  `,
  hero: css`
    padding-block: 76px 56px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    align-items: center;
    gap: 72px;
    & h1 {
      font-size: ${DISPLAY}px;
      line-height: 1.22;
      letter-spacing: -0.035em;
      margin-bottom: 24px;
    }
    & p {
      font-size: ${FONT_SIZE.section}px;
      line-height: 1.9;
    }
    @media (max-width: 1000px) {
      gap: 32px;
      & h1 {
        font-size: ${FONT_SIZE.display * 1.65}px;
      }
    }
    @media (max-width: 700px) {
      grid-template-columns: minmax(0, 1fr);
      gap: 36px;
      padding-block: 44px 36px;
      & h1 {
        font-size: ${FONT_SIZE.display * 1.4}px;
        margin-bottom: 20px;
      }
      & p {
        font-size: ${FONT_SIZE.reading}px;
      }
    }
  `,
  actions: css`
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 28px;
    & a {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      min-height: 44px;
      padding: 10px 18px;
      border-radius: ${token.borderRadius}px;
      font-size: ${FONT_SIZE.body}px;
      line-height: 1.5;
      font-weight: 500;
    }
  `,
  primary: css`
    background: ${token.colorPrimary};
    color: ${token.colorWhite} !important;
    &:hover {
      background: ${token.colorPrimaryHover};
    }
    &:active {
      background: ${token.colorPrimaryActive};
    }
  `,
  secondary: css`
    color: ${token.colorText};
    &:hover {
      background: ${token.tintHover};
      color: ${token.colorText};
    }
  `,
  workbenchLoading: css`
    min-height: 560px;
    display: grid;
    place-items: center;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 8px;
    color: ${token.colorTextSecondary};
    font-size: ${FONT_SIZE.body}px;
  `,
  demoCaption: css`
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
    color: ${token.colorTextSecondary};
    font-size: ${FONT_SIZE.meta}px;
    margin-top: 16px;
  `,
  section: css`
    padding-block: 104px;
    border-bottom: 1px solid ${token.colorBorderSecondary};
    @media (max-width: 700px) {
      padding-block: 64px;
    }
  `,
  intro: css`
    max-width: 650px;
    margin-bottom: 48px;
    & p {
      margin-top: 20px;
    }
  `,
  workflow: css`
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 48px;
    & article {
      padding-top: 24px;
      border-top: 1px solid ${token.colorBorderSecondary};
    }
    & svg {
      color: ${token.colorLink};
      margin-bottom: 20px;
    }
    & h3 {
      margin-bottom: 12px;
    }
    & p {
      max-width: 36ch;
    }
    @media (max-width: 700px) {
      grid-template-columns: minmax(0, 1fr);
      gap: 32px;
      & p {
        max-width: none;
      }
    }
  `,
  ownership: css`
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 96px;
    & h2 {
      max-width: 13ch;
    }
    & p {
      margin-top: 20px;
      max-width: 42ch;
    }
    & dl {
      margin: 0;
    }
    & dt {
      font-size: ${FONT_SIZE.section}px;
      font-weight: 600;
    }
    & dd {
      margin: 8px 0 28px;
      color: ${token.colorTextSecondary};
    }
    & dd:last-child {
      margin-bottom: 0;
    }
    @media (max-width: 700px) {
      grid-template-columns: minmax(0, 1fr);
      gap: 36px;
    }
  `,
  deployments: css`
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 64px;
    & article {
      border-top: 1px solid ${token.colorBorderSecondary};
      padding-top: 24px;
    }
    & article > svg {
      color: ${token.colorTextSecondary};
      margin-bottom: 20px;
    }
    & p {
      margin-top: 12px;
      max-width: 48ch;
    }
    & a {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-top: 24px;
      color: ${token.colorLink};
      min-height: 44px;
    }
    @media (max-width: 700px) {
      grid-template-columns: minmax(0, 1fr);
      gap: 36px;
    }
  `,
  note: css`
    margin-top: 32px !important;
    font-size: ${FONT_SIZE.body}px;
    padding: 20px 24px;
    background: ${token.tintList};
    border-radius: ${token.borderRadius}px;
  `,
  faq: css`
    display: grid;
    grid-template-columns: 1fr 1.4fr;
    gap: 72px;
    @media (max-width: 700px) {
      grid-template-columns: minmax(0, 1fr);
      gap: 28px;
    }
  `,
  closing: css`
    padding-block: 88px;
    text-align: center;
    & p {
      margin-top: 16px;
    }
    & > div {
      justify-content: center;
    }
    @media (max-width: 700px) {
      padding-block: 64px;
    }
  `,
  footer: css`
    padding-block: 28px;
    border-top: 1px solid ${token.colorBorderSecondary};
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 20px;
    & p {
      font-size: ${FONT_SIZE.meta}px;
    }
    & a:last-child {
      color: ${token.colorTextSecondary};
      font-size: ${FONT_SIZE.body}px;
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
  `,
}))
