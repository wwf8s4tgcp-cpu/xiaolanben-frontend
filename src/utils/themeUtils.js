/**
 * 主题工具函数
 * 用于管理应用的主题系统
 */

// 获取系统主题
export const getSystemTheme = () => {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'moon' : 'day'
}

// 主题常量
const AUTO_DAY_START = 6
const AUTO_DAY_END = 18
const AUTO_CHECK_INTERVAL = 60000

// 获取自动主题（根据当前时间：6:00-18:00 为 day，18:00-6:00 为 moon）
export const getAutoTheme = () => {
  const hour = new Date().getHours()
  return hour >= AUTO_DAY_START && hour < AUTO_DAY_END ? 'day' : 'moon'
}

// 应用主题到DOM
export const applyTheme = (theme) => {
  let actualTheme = theme
  if (theme === 'system') {
    actualTheme = getSystemTheme()
  } else if (theme === 'auto') {
    actualTheme = getAutoTheme()
  }
  // day 主题使用 :root 默认值（白日）
  if (actualTheme === 'day') {
    document.documentElement.removeAttribute('data-theme')
    return 'day'
  }
  document.documentElement.setAttribute('data-theme', actualTheme)
  return actualTheme
}

// 获取当前保存的主题设置
export const getSavedTheme = () => {
  return localStorage.getItem('theme') || 'day'
}

// 保存主题设置
export const saveTheme = (theme) => {
  localStorage.setItem('theme', theme)
}

// 初始化主题系统
export const initTheme = () => {
  const savedTheme = getSavedTheme()
  const appliedTheme = applyTheme(savedTheme)

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  const handleSystemThemeChange = () => {
    const currentSavedTheme = getSavedTheme()
    if (currentSavedTheme === 'system') {
      applyTheme('system')
    }
  }
  mediaQuery.addEventListener('change', handleSystemThemeChange)

  let autoInterval = null
  if (savedTheme === 'auto') {
    autoInterval = setInterval(() => {
      const currentSavedTheme = getSavedTheme()
      if (currentSavedTheme === 'auto') {
        applyTheme('auto')
      }
    }, AUTO_CHECK_INTERVAL)
  }

  return {
    savedTheme,
    appliedTheme,
    cleanup: () => {
      mediaQuery.removeEventListener('change', handleSystemThemeChange)
      if (autoInterval) clearInterval(autoInterval)
    }
  }
}

// 设置主题（包含保存和应用）
export const setTheme = (theme) => {
  saveTheme(theme)
  return applyTheme(theme)
}

// 主题选项配置
export const themeOptions = [
  {
    value: 'day',
    label: '白日',
    icon: 'sun'
  },
  {
    value: 'moon',
    label: '黑夜',
    icon: 'moon'
  },
  {
    value: 'blue',
    label: '小蓝本',
    icon: 'home'
  },
  {
    value: 'system',
    label: '系统',
    icon: 'monitor'
  }
]
