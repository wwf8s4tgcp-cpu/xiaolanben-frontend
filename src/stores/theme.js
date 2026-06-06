import { defineStore } from 'pinia'
import { computed, shallowRef, onUnmounted } from 'vue'
import {
  getSavedTheme,
  setTheme as setThemeUtil,
  getSystemTheme,
  getAutoTheme,
  themeOptions
} from '@/utils/themeUtils'

export const useThemeStore = defineStore('theme', () => {
  const currentTheme = shallowRef(getSavedTheme())

  const autoTheme = computed(() => getAutoTheme())

  const actualTheme = computed(() => {
    if (currentTheme.value === 'system') return getSystemTheme()
    return currentTheme.value
  })

  const isDark = computed(() => {
    const theme = actualTheme.value
    return theme === 'moon' || theme === 'dark'
  })

  const isLight = computed(() => !isDark.value)
  const isSystem = computed(() => currentTheme.value === 'system')
  const isDay = computed(() => currentTheme.value === 'day')

  const setTheme = (theme) => {
    currentTheme.value = theme
    setThemeUtil(theme)
  }

  const toggleTheme = () => {
    const currentIndex = themeOptions.findIndex(opt => opt.value === currentTheme.value)
    const nextIndex = (currentIndex + 1) % themeOptions.length
    setTheme(themeOptions[nextIndex].value)
  }

  const toggleTwoTheme = () => {
    const c = currentTheme.value
    if (c === 'blue' || c === 'moon') {
      setTheme(c === 'blue' ? 'moon' : 'blue')
    } else {
      setTheme('day')
    }
  }

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  const handleSystemThemeChange = () => {
    if (currentTheme.value === 'system') setThemeUtil('system')
  }
  mediaQuery.addEventListener('change', handleSystemThemeChange)

  onUnmounted(() => {
    mediaQuery.removeEventListener('change', handleSystemThemeChange)
  })

  return {
    currentTheme, actualTheme, autoTheme,
    isDark, isLight, isSystem, isDay,
    setTheme, toggleTheme, toggleTwoTheme,
    themeOptions
  }
})
