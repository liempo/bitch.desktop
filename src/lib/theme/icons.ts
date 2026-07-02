import add from './prime-icons/add.svg?raw'
import agent from './prime-icons/agent.svg?raw'
import archive from './prime-icons/archive.svg?raw'
import arrowDown from './prime-icons/arrowDown.svg?raw'
import arrowLeft from './prime-icons/arrowLeft.svg?raw'
import arrowRight from './prime-icons/arrowRight.svg?raw'
import arrowUp from './prime-icons/arrowUp.svg?raw'
import arrowUpRight from './prime-icons/arrowUpRight.svg?raw'
import assets from './prime-icons/assets.svg?raw'
import attach from './prime-icons/attach.svg?raw'
import board from './prime-icons/board.svg?raw'
import calendar from './prime-icons/calendar.svg?raw'
import check from './prime-icons/check.svg?raw'
import chevronDown from './prime-icons/chevronDown.svg?raw'
import chevronRight from './prime-icons/chevronRight.svg?raw'
import close from './prime-icons/close.svg?raw'
import cron from './prime-icons/cron.svg?raw'
import download from './prime-icons/download.svg?raw'
import error from './prime-icons/error.svg?raw'
import external from './prime-icons/external.svg?raw'
import file from './prime-icons/file.svg?raw'
import fileArchive from './prime-icons/fileArchive.svg?raw'
import fileAudio from './prime-icons/fileAudio.svg?raw'
import fileCode from './prime-icons/fileCode.svg?raw'
import fileHtml from './prime-icons/fileHtml.svg?raw'
import fileImage from './prime-icons/fileImage.svg?raw'
import filePdf from './prime-icons/filePdf.svg?raw'
import fileText from './prime-icons/fileText.svg?raw'
import fileVideo from './prime-icons/fileVideo.svg?raw'
import filter from './prime-icons/filter.svg?raw'
import folder from './prime-icons/folder.svg?raw'
import home from './prime-icons/home.svg?raw'
import kanban from './prime-icons/kanban.svg?raw'
import menu from './prime-icons/menu.svg?raw'
import pin from './prime-icons/pin.svg?raw'
import search from './prime-icons/search.svg?raw'
import settings from './prime-icons/settings.svg?raw'
import shieldCheck from './prime-icons/shieldCheck.svg?raw'
import sortAscending from './prime-icons/sortAscending.svg?raw'
import sortDescending from './prime-icons/sortDescending.svg?raw'
import stop from './prime-icons/stop.svg?raw'
import sync from './prime-icons/sync.svg?raw'
import theme from './prime-icons/theme.svg?raw'
import warning from './prime-icons/warning.svg?raw'

export const iconSources = {
  add,
  agent,
  archive,
  arrowDown,
  arrowLeft,
  arrowRight,
  arrowUp,
  arrowUpRight,
  assets,
  attach,
  board,
  calendar,
  check,
  chevronDown,
  chevronRight,
  close,
  cron,
  download,
  error,
  external,
  file,
  fileArchive,
  fileAudio,
  fileCode,
  fileHtml,
  fileImage,
  filePdf,
  fileText,
  fileVideo,
  filter,
  folder,
  home,
  kanban,
  menu,
  pin,
  search,
  settings,
  shieldCheck,
  sortAscending,
  sortDescending,
  stop,
  sync,
  theme,
  warning
} as const

export type IconName = keyof typeof iconSources

export function iconSvg(name: IconName): string {
  return iconSources[name]
}
