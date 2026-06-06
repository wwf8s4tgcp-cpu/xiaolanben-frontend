<script setup>
import SvgIcon from '@/components/SvgIcon.vue'
import DropdownMenu from '@/components/menu/DropdownMenu.vue'
import CommonMenu from '@/components/menu/CommonMenu.vue'
import { ref, computed, onMounted, watch } from 'vue'
import { useRouteUtils } from '@/composables/useRouteUtils'
import { useUserStore } from '@/stores/user.js'
import { useNotificationStore } from '@/stores/notification'
import { useAuthStore } from '@/stores/auth'

const { route, handleExploreClick } = useRouteUtils()
const userStore = useUserStore()
const notificationStore = useNotificationStore()
const authStore = useAuthStore()

const defaultAvatar = new URL('@/assets/imgs/avatar.png', import.meta.url).href
const logoUrl = new URL('@/assets/imgs/小蓝本.png', import.meta.url).href

// 从store获取未读通知数量
const unreadCount = computed(() => notificationStore.unreadCount)

// 菜单项配置
const menuItems = ref([
  { label: '发现', icon: 'home', path: '/explore' },
  { label: '发布', icon: 'publish', path: '/publish' },
  { label: '通知', icon: 'notification', path: '/notification' },
  { label: '我', icon: 'avatar', path: '/user' },
  { label: '更多', icon: 'menu', path: '' },
]);





// 监听登录状态变化
watch(() => userStore.isLoggedIn, (newValue) => {
  if (newValue) {
    notificationStore.fetchUnreadCount()
  } else {
    notificationStore.clearUnreadCount()
  }
}, { immediate: true })

// 监听路由变化，当从通知页面离开时刷新未读数量
const NOTIFICATION_REFRESH_DELAY = 500
watch(() => route.path, (newPath, oldPath) => {
  if (oldPath === '/notification' && newPath !== '/notification' && userStore.isLoggedIn) {
    setTimeout(() => {
      notificationStore.fetchUnreadCount()
    }, NOTIFICATION_REFRESH_DELAY)
  }
})

// 登录按钮点击处理
const handleLoginClick = () => {
  authStore.openLoginModal()
}

function handleAvatarError(event) {
  event.target.src = defaultAvatar
}

// 初始化用户信息
onMounted(() => {
  userStore.initUserInfo()
  if (userStore.isLoggedIn) {
    notificationStore.fetchUnreadCount()
  }
})
</script>

<template>
  <nav class="sidebar">
    <!-- Logo -->
    <div class="sidebar-logo" @click="router.push('/')">
      <img :src="logoUrl" alt="小蓝本" class="sidebar-logo-img" />
    </div>

    <ul class="sidebar-menu">

      <li>
        <div class="sidebar-link" @click="handleExploreClick"
          :class="{ 'active-link': route.path.startsWith('/explore') }">
          <span class="sidebar-icon">
            <SvgIcon :name="menuItems[0].icon" width="22px" height="22px"
              :class="{ active: route.path.startsWith('/explore') }" />
          </span>
          <span class="sidebar-label">{{ menuItems[0].label }}</span>
        </div>
      </li>

      <li v-for="item in menuItems.slice(1, 3)" :key="item.label"
        :class="{ 'notification-item': item.icon === 'notification' }">
        <RouterLink :to="item.path" class="sidebar-link"
          :class="{ 'active-link': route.path === item.path }">
          <span v-if="item.icon" class="sidebar-icon">
            <SvgIcon :name="item.icon" width="22px" height="22px" :class="{ active: route.path === item.path }" />
          </span>
          <span v-else-if="item.emoji" class="sidebar-icon">{{ item.emoji }}</span>
          <span class="sidebar-label">{{ item.label }}</span>

          <div v-if="item.icon === 'notification' && unreadCount > 0" class="count">{{ unreadCount > 99 ? '···' :
            unreadCount }}</div>
        </RouterLink>
      </li>


      <li v-if="userStore.isLoggedIn">
        <RouterLink :to="menuItems[3].path" class="sidebar-link"
          :class="{ 'active-link': route.path === menuItems[3].path }">
          <span class="sidebar-icon">
            <img :src="userStore.userInfo?.avatar || defaultAvatar" :alt="userStore.userInfo?.nickname || '用户头像'"
              class="avatar-icon" @error="handleAvatarError" style="width:22px;height:22px;" />
          </span>
          <span class="sidebar-label">{{ menuItems[3].label }}</span>
        </RouterLink>
      </li>


      <li v-else>
        <button class="login-btn" @click="handleLoginClick">
          登录
        </button>
      </li>
    </ul>

    <div class="sidebar-footer">
      <DropdownMenu direction="up">
        <template #trigger>
          <li class="sidebar-footer-item">
            <div class="sidebar-link">
              <span class="sidebar-icon">
                <SvgIcon :name="menuItems[4].icon" width="22px" height="22px" />
              </span>
              <span class="sidebar-label">{{ menuItems[4].label }}</span>
            </div>
          </li>
        </template>
        <template #menu>
          <CommonMenu />
        </template>
      </DropdownMenu>
    </div>


  </nav>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  width: 208px;
  background: var(--bg-color-primary);
  position: fixed;
  z-index: 100;
  left: max(calc(50% - 750px), 0px);
  top: 0;
  height: 100vh;
  overflow-y: auto;
  padding: 20px 12px 12px 12px;
  justify-content: space-between;
  border-right: 1px solid var(--border-color-primary);
  transition: border-color 0.2s ease, background-color 0.2s ease;
}

/* 侧边栏Logo - 水平居中 */
.sidebar-logo {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  padding: 0 0 20px 0;
  cursor: pointer;
}

.sidebar-logo-img {
  width: 62px;
  height: 62px;
  border-radius: 14px;
  object-fit: contain;
}

.sidebar-menu {
  flex: 1;
  list-style: none;
  padding: 0;
  margin: 0;
  left: 16px;
}

.sidebar-menu li {
  display: flex;
  align-items: center;
  font-size: 16px;
  font-weight: 700;
  height: 48px;
  margin-bottom: 8px;
}

.sidebar-footer-item {
  display: flex;
  align-items: center;
  font-size: 16px;
  font-weight: 700;
  height: 48px;
  margin-bottom: 8px;
  border-radius: 999px;
  list-style: none;
  cursor: pointer;
}

.sidebar-footer-item:hover {
  background: var(--bg-color-secondary);
}

.sidebar-link {
  display: flex;
  align-items: center;
  width: 100%;
  height: 100%;
  padding: 0px 14px;
  color: var(--text-color-primary);
  text-decoration: none;
  border-radius: 999px;
  cursor: pointer;
}

.sidebar-link:hover {
  background: var(--bg-color-secondary);
}

/* 激活状态的链接样式 */
.sidebar-link.active-link {
  background: var(--bg-color-secondary);
  transition: border-color 0.2s ease, background-color 0.2s ease;
}

.sidebar-footer-item .sidebar-link:hover {
  background: transparent;
}

.icon {
  color: var(--text-color-tertiary);
}

.active {
  color: var(--text-color-primary);
}

.sidebar-icon {
  margin-right: 14px;
  display: flex;
  align-items: center;
}

.avatar-icon {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  object-fit: cover;
}

.sidebar-footer {
  margin-top: auto;
  margin-bottom: 20px;
}

.theme-switcher-container {
  padding: 0;
}

/* 登录按钮样式 */
.login-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 0px 14px;
  background: var(--primary-color);
  color: white;
  border: none;
  border-radius: 999px;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
}

/* 通知badge样式 */
.notification-item {
  position: relative;
}

.notification-item .count {
  position: absolute;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background-color: var(--danger-color);
  color: white;
  font-size: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  top: 14px;
  left: 80px;
}

/* 移动端隐藏侧边栏 */
@media (max-width: 960px) {
  .sidebar {
    display: none;
  }
}
</style>