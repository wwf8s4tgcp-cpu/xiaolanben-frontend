<script setup>
import BaseSkeleton from './skeleton/BaseSkeleton.vue'
import SkeletonList from './skeleton/SkeletonList.vue'
import SimpleSpinner from './spinner/SimpleSpinner.vue'
import DetailCard from './DetailCard.vue'
import LikeButton from './LikeButton.vue'
import SvgIcon from './SvgIcon.vue'
import { ref, nextTick, watch, onMounted, onUnmounted } from 'vue'

let contentInitialized = false
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { useLikeStore } from '@/stores/like.js'
import { useCollectStore } from '@/stores/collect.js'
import { useAuthStore } from '@/stores/auth'
import { getPostList } from '@/api/posts.js'
import defaultAvatar from '@/assets/imgs/avatar.png'
import xiaolanbenPlaceholder from '@/assets/imgs/未加载.png'

// 使用小蓝本 SVG 占位图替代
const placeholderImg = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect fill="#f0f0f0" width="400" height="400" rx="16"/><text fill="#b0b0b0" font-family="system-ui,sans-serif" font-size="36" font-weight="500" text-anchor="middle" x="200" y="210">小蓝本</text></svg>')
import { stuckItemManager } from '@/directives/index.js'

const props = defineProps({
    refreshKey: {
        type: Number,
        default: 0
    },
    category: {
        type: [String, Number],
        default: null
    },
    searchKeyword: {
        type: String,
        default: ''
    },
    searchTag: {
        type: String,
        default: ''
    },
    userId: {
        type: [Number, String],
        default: null
    },
    type: {
        type: [String, Number],
        default: null
    },
    preloadedPosts: {
        type: Array,
        default: () => []
    }
})

const router = useRouter()
const userStore = useUserStore()
const likeStore = useLikeStore()
const collectStore = useCollectStore()
const authStore = useAuthStore()

// 定义emit事件
const emit = defineEmits(['follow', 'unfollow', 'like', 'collect'])

const loading = ref(true)
const loadingMore = ref(false)
const hasMore = ref(true)
const currentPage = ref(1)
const pageSize = 12

// 添加初次加载标识
const isInitialLoad = ref(true)

// DetailCard 相关状态
const showDetailCard = ref(false)
const selectedItem = ref(null)
const clickPosition = ref({ x: 0, y: 0 })

// 瀑布流相关状态
const containerRef = ref(null)
const columnCount = ref(2) // 当前列数
const columnGap = ref(10) // 列间距
const columns = ref([]) // 每列的内容数组
const columnHeights = ref([]) // 每列的高度
const itemHeights = ref({}) // 每个item的高度缓存

// 分批加载控制
const batchSize = ref(8) // 每批加载的数量
const loadedItemCount = ref(0) // 已加载的item数量

// 性能优化相关

// 简化的监控状态
const imageMonitorTimer = ref(null)
// 定义数据数组
const contentList = ref([])
// 每个item的加载状态
const itemLoadingStates = ref({})
// 新加载内容的动画状态
const newItemAnimStates = ref({})

// 计算当前应该使用的列数
const updateColumnCount = () => {
    const width = window.innerWidth
    if (width >= 1200) {
        columnCount.value = 5
        columnGap.value = 18
        batchSize.value = 15
    } else if (width >= 1000) {
        columnCount.value = 4
        columnGap.value = 16
        batchSize.value = 12
    } else if (width >= 750) {
        columnCount.value = 3
        columnGap.value = 14
        batchSize.value = 9
    } else {
        columnCount.value = 2
        columnGap.value = 10
        batchSize.value = 6
    }
}

// 初始化列数组
const initColumns = () => {
    columns.value = Array.from({ length: columnCount.value }, () => [])
    columnHeights.value = Array.from({ length: columnCount.value }, () => 0)
}

// 获取最短列的索引
const getShortestColumnIndex = () => {
    let minHeight = Math.min(...columnHeights.value)
    return columnHeights.value.indexOf(minHeight)
}

// 估算item高度（用于初始瀑布流布局）
const estimateItemHeight = (item) => {
    const titleLines = Math.min(Math.ceil((item.title?.length || 0) / 18), 2)
    const titleHeight = titleLines * 22
    const bottomHeight = 42
    const containerPadding = 16 * 2
    const totalGap = columnGap.value * (columnCount.value - 1)
    const columnWidth = (window.innerWidth - containerPadding - totalGap) / columnCount.value
    // 默认 4:3 → 高度 = 宽度 × 0.75
    const imageHeight = columnWidth * 0.75
    return imageHeight + titleHeight + bottomHeight
}

// 将内容分配到列中（优化版）
const distributeContent = (newItems = []) => {
    const itemsToProcess = newItems.length > 0 ? newItems : contentList.value

    if (itemsToProcess.length === 0) {
        return
    }

    // 使用 requestAnimationFrame 延迟布局计算，加 setTimeout 保底
    const doDistribute = () => {
        if (newItems.length === 0) {
            initColumns()
            distributeItemsToColumns(contentList.value)
        } else {
            distributeItemsToColumns(newItems)
        }
    }
    requestAnimationFrame(doDistribute)
    // setTimeout 保底：如果 rAF 不触发（如隐藏标签页），200ms 后仍执行
    setTimeout(doDistribute, 200)
}

// 实际分配项目到列的函数
const distributeItemsToColumns = (items) => {
    items.forEach((item, index) => {
        const shortestColumnIndex = getShortestColumnIndex()
        columns.value[shortestColumnIndex].push(item)

        // 优化的高度估算和缓存
        const estimatedHeight = getOrEstimateItemHeight(item)
        columnHeights.value[shortestColumnIndex] += estimatedHeight

        // 分批加载控制：大屏四列时的优化
        if (columnCount.value >= 4 && index > 0 && index % batchSize.value === 0) {
            // 每处理一批后稍作停顿，避免主线程阻塞
            setTimeout(() => { }, 0)
        }
    })
}

// 优化的高度获取/估算函数
const getOrEstimateItemHeight = (item) => {
    // 先检查缓存
    if (itemHeights.value[item.id]) {
        return itemHeights.value[item.id]
    }

    // 优化的高度估算算法
    const estimatedHeight = estimateItemHeight(item)
    itemHeights.value[item.id] = estimatedHeight
    return estimatedHeight
}

// 当图片加载完成后，更新实际高度（优化版）
const updateItemHeight = (itemId) => {
    // 使用 requestAnimationFrame 避免频繁的重排
    requestAnimationFrame(() => {
        const itemElement = document.querySelector(`[data-item-id="${itemId}"]`)
        if (!itemElement) return

        const actualHeight = itemElement.offsetHeight
        const estimatedHeight = itemHeights.value[itemId] || 0
        const heightDiff = actualHeight - estimatedHeight

        // 只有高度差异超过10px才更新，减少不必要的计算
        if (Math.abs(heightDiff) < 10) {
            return
        }

        // 更新缓存的高度
        itemHeights.value[itemId] = actualHeight

        // 找到该item所在的列，更新列高度（O(1)操作）
        for (let i = 0; i < columns.value.length; i++) {
            const columnItems = columns.value[i]
            if (columnItems.some(item => item.id === itemId)) {
                columnHeights.value[i] += heightDiff
                break
            }
        }

        // 增加已加载计数
        loadedItemCount.value++
    })
}

// 组件挂载时初始化
onMounted(() => {
    if (!contentInitialized) {
        contentInitialized = true
        initContent()
    }
})

// 初始化内容
async function initContent() {
    if (isInitialLoad.value) {
        loading.value = true
    }

    currentPage.value = 1
    hasMore.value = true
    try {
        let content = []

        if (props.preloadedPosts && props.preloadedPosts.length > 0) {
            content = props.preloadedPosts
            hasMore.value = false
        } else {
            const result = await getPostList({
                page: 1,
                limit: pageSize,
                category: props.category,
                searchKeyword: props.searchKeyword,
                searchTag: props.searchTag,
                userId: props.userId,
                type: props.type
            })
            content = result.posts || []
            hasMore.value = result.hasMore !== false
        }

        // 如果不是初次加载，为新内容添加淡入动画
        if (!isInitialLoad.value) {
            const newAnimStates = {}
            content.forEach(item => {
                newAnimStates[item.id] = {
                    isNew: true,
                    fadeIn: false
                }
            })
            Object.assign(newItemAnimStates.value, newAnimStates)
        }

        contentList.value = content

        // 初始化点赞状态到全局store
        likeStore.initPostsLikeStates(content)

        // 初始化收藏状态到全局store
        collectStore.initPostsCollectStates(content)

        // 初始化每个item的加载状态（保留已有的加载状态）
        const loadingStates = {}
        content.forEach(item => {
            // 如果该item已经有加载状态，保留它；否则初始化为false
            loadingStates[item.id] = itemLoadingStates.value[item.id] || {
                imageLoaded: false,
                avatarLoaded: false
            }
        })
        itemLoadingStates.value = loadingStates

        // 如果是初次加载，跳过入场动画，直接显示所有内容
        if (isInitialLoad.value) {
            newItemAnimStates.value = {}
        } else {
            // 非初次加载时，为新内容触发淡入动画
            nextTick(() => {
                setTimeout(() => {
                    content.forEach(item => {
                        if (newItemAnimStates.value[item.id]) {
                            newItemAnimStates.value[item.id].fadeIn = true
                        }
                    })
                }, 100)
            })
        }

        // 网格布局不需要列分配，直接更新即可
        updateColumnCount()

    } catch (error) {
        console.error('加载内容失败:', error)
    } finally {
        if (isInitialLoad.value) {
            loading.value = false
            isInitialLoad.value = false // 标记初次加载完成
            // 内容渲染后立即检查首屏图片
            nextTick(() => {
                forceCheckFirstScreenImages()
                setTimeout(() => forceCheckFirstScreenImages(), 200)
            })
        }
    }
}

// 加载更多内容
async function loadMoreContent() {
    // 如果使用预加载数据，不支持加载更多
    if (props.preloadedPosts && props.preloadedPosts.length > 0) {
        return
    }

    if (loadingMore.value || !hasMore.value) {
        return
    }
    loadingMore.value = true
    currentPage.value++

    try {
        // 使用笔记API服务
        const result = await getPostList({
            page: currentPage.value,
            limit: pageSize,
            category: props.category,
            searchKeyword: props.searchKeyword,
            searchTag: props.searchTag,
            userId: props.userId,
            type: props.type
        })

        const newContent = result.posts || []
        hasMore.value = result.hasMore !== false

        // 如果没有新内容，说明没有更多数据了
        if (newContent.length === 0) {
            hasMore.value = false
            return
        }

        // 添加到现有内容列表
        contentList.value.push(...newContent)

        // 初始化新内容的点赞状态到全局store
        likeStore.initPostsLikeStates(newContent)

        // 初始化新内容的收藏状态到全局store
        collectStore.initPostsCollectStates(newContent)

        // 初始化新内容的加载状态
        const newLoadingStates = {}
        newContent.forEach(item => {
            newLoadingStates[item.id] = {
                imageLoaded: false,
                avatarLoaded: false
            }
        })
        Object.assign(itemLoadingStates.value, newLoadingStates)

        // 为新内容添加淡入动画状态
        const newAnimStates = {}
        newContent.forEach(item => {
            newAnimStates[item.id] = {
                isNew: true,
                fadeIn: false
            }
        })
        Object.assign(newItemAnimStates.value, newAnimStates)

        // 延迟触发淡入动画
        nextTick(() => {
            setTimeout(() => {
                newContent.forEach(item => {
                    if (newItemAnimStates.value[item.id]) {
                        newItemAnimStates.value[item.id].fadeIn = true
                    }
                })
            }, 100)
        })

        // 加载完成

    } catch (error) {
        console.error('加载更多内容失败:', error)
        // 发生错误时回退页码
        currentPage.value--
    } finally {
        loadingMore.value = false
    }
}

// 防抖定时器
let scrollTimer = null
let resizeTimer = null
let isScrollHandling = ref(false)

// 页面滚动加载
function handleScroll() {
    if (loadingMore.value || !hasMore.value || isScrollHandling.value) return

    const scrollTop = window.pageYOffset || document.documentElement.scrollTop
    const windowHeight = window.innerHeight
    const documentHeight = document.documentElement.scrollHeight

    if (scrollTop + windowHeight >= documentHeight - 400) {
        if (scrollTimer) clearTimeout(scrollTimer)
        scrollTimer = setTimeout(() => {
            if (loadingMore.value || !hasMore.value) return
            isScrollHandling.value = true
            loadMoreContent().finally(() => {
                isScrollHandling.value = false
            })
        }, 200)
    }
}

function handleResize() {
    if (resizeTimer) clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => { updateColumnCount() }, 300)
}

// 刷新时重新生成内容
watch(() => props.refreshKey, async () => {
    stuckItemManager.clearAll()
    await initContent()
})

// 监听分类变化
watch(() => props.category, async () => {
    stuckItemManager.clearAll()
    await initContent()
})

// 监听搜索关键词变化
watch(() => props.searchKeyword, async () => {
    await initContent()
})

// 监听搜索标签变化
watch(() => props.searchTag, async () => {
    await initContent()
})

// 监听预加载笔记数据变化
watch(() => props.preloadedPosts, async (newPosts, oldPosts) => {
    // 如果新数据和旧数据都存在且长度相同且内容相同，则跳过更新
    if (newPosts && oldPosts && newPosts.length === oldPosts.length && newPosts.length > 0) {
        const isSameData = newPosts.every((post, index) =>
            oldPosts[index] && post.id === oldPosts[index].id
        )
        if (isSameData) {
            return
        }
    }

    await initContent()
}, { deep: true })

// 监听用户ID变化
watch(() => props.userId, async () => {
    await initContent()
})

// 监听类型变化（用于用户页面的tab切换：posts/collections/likes）
watch(() => props.type, async () => {
    // 重置初次加载标识，确保切换tab时显示加载状态
    isInitialLoad.value = true
    await initContent()
})

// 处理浏览器后退/前进按钮
const handlePopState = (event) => {
    if (event.state && event.state.showDetailCard && showDetailCard.value) {
        // 如果当前显示DetailCard且历史状态表明应该显示，不做处理
        return
    }

    if (showDetailCard.value) {
        // 如果当前显示DetailCard但历史状态不支持，关闭DetailCard
        showDetailCard.value = false
        selectedItem.value = null
    }
}

// 初始加载
onMounted(async () => {
    updateColumnCount() // 确保列数在内容渲染前计算
    await initContent()
    nextTick(() => {
        // 多级重试，覆盖瀑布流布局完成的不同时序
        setTimeout(() => forceCheckFirstScreenImages(), 100)
        setTimeout(() => forceCheckFirstScreenImages(), 400)
        setTimeout(() => forceCheckFirstScreenImages(), 1000)
    })
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleResize, { passive: true })
    window.addEventListener('popstate', handlePopState)
    startImageLoadingMonitor()
    document.addEventListener('force-recheck', handleForceRecheck)
})

// 简化的图片加载监控
const startImageLoadingMonitor = () => {
    if (imageMonitorTimer.value) {
        clearInterval(imageMonitorTimer.value)
    }

    // 统一的监控定时器，每5秒检查一次
    imageMonitorTimer.value = setInterval(() => {
        checkImageLoadingStatus()
    }, 5000)
}

// 统一的图片加载状态检查
const checkImageLoadingStatus = () => {
    const allItems = document.querySelectorAll('.waterfall-item')
    let stuckCount = 0

    allItems.forEach((item, index) => {
        const rect = item.getBoundingClientRect()

        // 检查是否在视口内或首屏
        const isInViewport = rect.top < window.innerHeight + 200 && rect.bottom > -200
        const isFirstScreen = index < columnCount.value * 3

        if (isInViewport || isFirstScreen) {
            // 如果 item 本身被入场动画遮住了，直接恢复
            const itemCs = getComputedStyle(item)
            if (itemCs.opacity === '0') {
                item.style.opacity = '1'
                item.style.transform = 'translateY(0) translateZ(0)'
                item.classList.add('fade-in')
                stuckCount++
            }
        }

        const img = item.querySelector('.content-image, .lazy-image, [v-img-lazy]')

        if ((isInViewport || isFirstScreen) && img) {
            const isStuck = !img.src || img.src === 'data:' || img.style.opacity === '0'

            if (isStuck) {
                // 如果浏览器已经加载成功，直接恢复可见性
                if (img.complete && img.naturalWidth > 0) {
                    img.style.opacity = '1'
                    img.style.visibility = 'visible'
                    img.classList.add('fade-in')
                    stuckCount++
                } else {
                    stuckCount++
                    const imgSrc = img.getAttribute('v-img-lazy') || img.dataset.src
                    if (imgSrc) {
                        loadImageDirectly(img, imgSrc)
                    }
                }
            }
        }
    })

}



// 简化的布局恢复
const triggerLayoutRecovery = () => {
    // 直接调用统一的检查函数
    checkImageLoadingStatus()
}

// 处理强制重新检查事件
const handleForceRecheck = () => {
    checkImageLoadingStatus()
}

// 简化的首屏图片检查
const forceCheckFirstScreenImages = () => {
    const allItems = document.querySelectorAll('.waterfall-item')
    let checkedCount = 0

    // 如果还没有渲染出任何item，延迟重试
    if (allItems.length === 0) {
        setTimeout(() => forceCheckFirstScreenImages(), 200)
        setTimeout(() => forceCheckFirstScreenImages(), 600)
        return
    }

    allItems.forEach((item, index) => {
        // 只检查前三行
        if (index >= columnCount.value * 3) return

        // 如果 item 本身被入场动画遮住了(opacity:0)，直接恢复可见
        const itemCs = getComputedStyle(item)
        if (itemCs.opacity === '0') {
            item.style.opacity = '1'
            item.style.transform = 'translateY(0) translateZ(0)'
            item.classList.add('fade-in')
            checkedCount++
        }

        const img = item.querySelector('.content-image, .lazy-image, [v-img-lazy]')
        if (!img) return

        const needsFix = !img.src || img.src === 'data:' || img.style.opacity === '0'
        if (!needsFix) return

        // 如果浏览器已经通过 :src 绑定加载成功，直接恢复可见性
        if (img.complete && img.naturalWidth > 0) {
            img.style.opacity = '1'
            img.style.visibility = 'visible'
            img.classList.add('fade-in')
            checkedCount++
            return
        }

        // 否则重新加载
        const imgSrc = img.getAttribute('v-img-lazy') || img.dataset.src
        if (imgSrc) {
            loadImageDirectly(img, imgSrc)
            checkedCount++
        }
    })

}

// 直接加载图片（绕过队列机制）
const loadImageDirectly = (imgElement, src) => {
    const img = new Image()

    // 5秒超时机制
    const timeout = setTimeout(() => {
        img.onload = null
        img.onerror = null
        // 根据图片类型选择不同的占位图
        const isAvatar = imgElement.classList.contains('lazy-avatar')
        const ph = isAvatar ? defaultAvatar : placeholderImg
        imgElement.src = ph
        imgElement.alt = '图片加载超时'
        imgElement.style.opacity = '1'
        imgElement.style.visibility = 'visible'
        imgElement.dispatchEvent(new Event('load'))
    }, 5000)

    img.onload = () => {
        clearTimeout(timeout)
        imgElement.src = src
        imgElement.style.opacity = '1'
        imgElement.style.visibility = 'visible'
        imgElement.classList.add('fade-in')
        imgElement.dispatchEvent(new Event('load'))
    }

    img.onerror = () => {
        clearTimeout(timeout)
        // 根据图片类型选择不同的占位图
        const isAvatar = imgElement.classList.contains('lazy-avatar')
        const ph = isAvatar ? defaultAvatar : placeholderImg
        imgElement.src = ph
        imgElement.alt = '图片加载失败'
        imgElement.style.opacity = '1'
        imgElement.style.visibility = 'visible'
        imgElement.dispatchEvent(new Event('load'))
    }

    img.src = src
}



const cleanup = () => {
    window.removeEventListener('scroll', handleScroll)
    window.removeEventListener('resize', handleResize)
    window.removeEventListener('popstate', handlePopState)
    document.removeEventListener('force-recheck', handleForceRecheck)
    if (scrollTimer) { clearTimeout(scrollTimer); scrollTimer = null }
    if (resizeTimer) { clearTimeout(resizeTimer); resizeTimer = null }
    if (imageMonitorTimer.value) { clearInterval(imageMonitorTimer.value); imageMonitorTimer.value = null }
}

onUnmounted(cleanup)

function onCardClick(item, event) {
    // 记录点击位置
    clickPosition.value = {
        x: event.clientX,
        y: event.clientY
    }
    // 设置选中的item并显示详情卡片（使用深拷贝避免影响原始数据）
    selectedItem.value = JSON.parse(JSON.stringify(item))
    showDetailCard.value = true

    // 修改页面标题
    const originalTitle = document.title
    document.title = item.title || '笔记详情'

    // 使用History API添加历史记录并更新URL
    const newUrl = `/post?id=${item.id}`
    window.history.pushState(
        {
            previousUrl: window.location.pathname + window.location.search,
            showDetailCard: true,
            postId: item.id,
            originalTitle: originalTitle
        },
        item.title || '笔记详情',
        newUrl
    )
}

// 关闭详情卡片
function closeDetailCard() {
    showDetailCard.value = false
    selectedItem.value = null

    // 恢复原始页面标题
    if (window.history.state && window.history.state.originalTitle) {
        document.title = window.history.state.originalTitle
    }

    // 恢复原URL状态
    if (window.history.state && window.history.state.previousUrl) {
        window.history.replaceState(window.history.state, '', window.history.state.previousUrl)
    } else {
        // 如果没有前一个URL，回到当前页面的原始状态
        window.history.back()
    }
}

// 用户点击处理函数
function onUserClick(userId, event) {
    event.stopPropagation() // 阻止事件冒泡，避免触发卡片点击
    if (userId) {
        // 使用小蓝本号作为用户页面路径参数
        const userUrl = `${window.location.origin}/user/${userId}`
        window.open(userUrl, '_blank')
    }
}

// DetailCard事件处理函数
function handleDetailCardFollow(userId) {
    emit('follow', userId)
}

function handleDetailCardUnfollow(userId) {
    emit('unfollow', userId)
}

// 处理DetailCard的点赞事件
const handleDetailCardLike = (data) => {
    emit('like', data)
}

// 处理DetailCard的收藏事件
const handleDetailCardCollect = (data) => {
    emit('collect', data)
}

async function onLikeClick(item, willBeLiked, e) {
    e.stopPropagation()

    // 检查用户是否已登录
    if (!userStore.isLoggedIn) {
        // 显示登录模态框
        authStore.openLoginModal()
        return
    }

    try {
        // 从点赞状态管理器获取当前状态
        const currentState = likeStore.getPostLikeState(item.id)

        // willBeLiked已经表示将要变成的状态，currentLiked应该是当前状态
        const currentLiked = currentState.liked

        // 使用点赞状态管理
        const result = await likeStore.togglePostLike(item.id, currentLiked, currentState.likeCount)

        if (!result.success) {
            console.error('点赞操作失败:', result.error)
        }
    } catch (error) {
        console.error('点赞操作失败:', error)
    }
}

// 图片加载完成回调
function onImageLoaded(itemId, type, event) {
    if (itemLoadingStates.value[itemId]) {
        itemLoadingStates.value[itemId][type] = true

        // 主图片加载完成：读取真实宽高，更新 aspect-ratio
        if (type === 'imageLoaded' && event && event.target) {
            const img = event.target
            const nw = img.naturalWidth
            const nh = img.naturalHeight
            if (nw && nh) {
                // 用对象展开确保 Vue 响应式更新
                const old = itemHeights.value[itemId] || {}
                itemHeights.value = {
                    ...itemHeights.value,
                    [itemId]: { ...old, naturalWidth: nw, naturalHeight: nh }
                }
            }
            updateItemHeight(itemId)
        }
    }
}

// 检查item是否完全加载完成 - 直接返回true，内容不等待图片
function isItemFullyLoaded() {
    return true
}

// 方形封面 1:1 — 参考图所有卡片封面都是正方形
function getCardImageStyle(item) {
    return { paddingTop: '100%' }
}

// 淡入动画结束处理
function onFadeInEnd(item) {
    if (newItemAnimStates.value[item.id]) {
        // 动画结束后移除新内容标记，避免重复动画
        delete newItemAnimStates.value[item.id]
    }
}

// 处理头像加载失败
function handleAvatarError(event) {
    if (event.target) {
        event.target.src = defaultAvatar
        const itemEl = event.target.closest('[data-item-id]')
        if (itemEl) {
            const itemId = parseInt(itemEl.getAttribute('data-item-id'))
            onImageLoaded(itemId, 'avatarLoaded')
        }
    }
}

// 处理封面图加载失败
function handleImageError(event) {
    if (event.target) {
        event.target.src = placeholderImg
        // 图片加载失败时也标记为已加载，让内容显示出来
        const itemEl = event.target.closest('[data-item-id]')
        if (itemEl) {
            const itemId = parseInt(itemEl.getAttribute('data-item-id'))
            onImageLoaded(itemId, 'imageLoaded')
        }
    }
}


</script>
<template>

    <SkeletonList v-if="loading" :count="8" type="image-card" layout="waterfall" image-height="random"
        :show-stats="false" :show-button="false" list-class="waterfall-layout" />


    <div v-else ref="containerRef" class="waterfall-container">

        <div v-if="contentList.length === 0 && !loadingMore" class="empty-state">
            <div class="empty-text">
                <template v-if="props.type === 'posts'">
                    还没有发布任何内容
                </template>
                <template v-else-if="props.type === 'collections'">
                    还没有收藏任何内容
                </template>
                <template v-else-if="props.type === 'likes'">
                    还没有点赞任何内容
                </template>
                <template v-else-if="props.searchKeyword">
                    没有找到相关内容
                </template>
                <template v-else>
                    暂无内容
                </template>
            </div>
        </div>

        <div v-else class="waterfall-grid">

            <div v-for="item in contentList" :key="item.id" :data-item-id="item.id" class="waterfall-item" :class="{
                'new-item': newItemAnimStates[item.id]?.isNew,
                'fade-in': newItemAnimStates[item.id]?.fadeIn
            }" @animationend="onFadeInEnd(item)">

                <div class="item-content">
                    <div class="content-img" :style="getCardImageStyle(item)" @click="onCardClick(item, $event)">
                        <img :src="item.image || placeholderImg" alt="" class="content-image"
                            decoding="async"
                            @error="handleImageError"
                            @load="onImageLoaded(item.id, 'imageLoaded', $event)">
                        <div v-if="item.type === 2" class="video-indicator">
                            <SvgIcon name="play" width="16" height="16" />
                        </div>
                    </div>
                    <div class="content-title">{{ item.title }}</div>
                    <div class="contentlist">
                        <img :src="item.avatar || defaultAvatar" alt="" class="avatar-image clickable-avatar"
                            decoding="async"
                            @error="handleAvatarError" @load="onImageLoaded(item.id, 'avatarLoaded')"
                            @click="onUserClick(item.author_account, $event)">
                        <div class="contentlist-info">
                            <div class="contentlist-name clickable-name"
                                @click="onUserClick(item.author_account, $event)">
                                {{ item.author }}</div>
                            <div class="contentlist-time">{{ item.created_at ? item.created_at.slice(0,10) : '' }}</div>
                        </div>
                        <div class="action-wrapper">
                            <div class="like-num-wrapper">
                                <LikeButton :is-liked="likeStore.getPostLikeState(item.id).liked"
                                    @click="(willBeLiked, event) => onLikeClick(item, willBeLiked, event)" />
                                <span class="like-num">{{ likeStore.getPostLikeState(item.id).likeCount }}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>


        <div class="load-more-indicator" :class="{ 'no-more-content': !hasMore && contentList.length > 0 }">
            <div v-if="loadingMore" class="loading-more">
                <SimpleSpinner size="24" />
                <span class="loading-text">加载中...</span>
            </div>
            <div v-else-if="!hasMore && contentList.length > 0" class="no-more">
                <span class="no-more-text">没有更多内容了</span>
            </div>
        </div>
    </div>


    <Teleport to="body">
        <DetailCard v-if="showDetailCard" :item="selectedItem" :click-position="clickPosition" @close="closeDetailCard"
            @follow="handleDetailCardFollow" @unfollow="handleDetailCardUnfollow" @like="handleDetailCardLike"
            @collect="handleDetailCardCollect" />
    </Teleport>


</template>
<style scoped>
/* 瀑布流容器 */
.waterfall-container {
    width: 100%;
    position: relative;
    padding: 0 16px;
    box-sizing: border-box;
}

/* 网格布局 - 四列均匀排布，列间有分隔线 */
.waterfall-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 24px;
    width: 100%;
    padding: 16px 0;
}

/* 卡片 - 白底圆角独立 */
.waterfall-item {
    width: 100%;
    border-radius: 12px;
    overflow: hidden;
    background: #fff;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
    box-sizing: border-box;
    transition: box-shadow 0.2s ease, transform 0.2s ease;
}

.waterfall-item:hover {
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.10);
    transform: translateY(-2px);
}

/* 优化动画性能 */
.waterfall-item.new-item {
    opacity: 0;
    transform: translateY(20px) translateZ(0);
    transition: opacity 0.6s ease-out, transform 0.6s ease-out;
    /* 确保动画不影响布局 */
    will-change: opacity, transform;
}

.waterfall-item.new-item.fade-in {
    opacity: 1;
    transform: translateY(0) translateZ(0);
}

/* 动画完成后移除will-change */
.waterfall-item:not(.new-item) {
    will-change: auto;
}

/* 空状态样式 */
.empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    min-height: 200px;
}

.empty-text {
    color: var(--text-color-secondary);
    font-size: 16px;
    line-height: 1.5;
}

/* 隐藏未加载完成的真实内容 */
.content-hidden {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    opacity: 0;
    pointer-events: none;
    z-index: -1;
    /* 确保隐藏内容不影响布局 */
    visibility: hidden;
}

.content-img {
    cursor: pointer;
    position: relative;
    overflow: hidden;
    border-radius: 12px 12px 0 0;
    z-index: 1;
    width: 100%;
    height: 0;
    /* 图片加载前的占位背景，让人能看出封面区域 */
    background: linear-gradient(135deg, var(--bg-color-secondary) 0%, var(--bg-color-tertiary) 100%);
    /* 加载中微动画 */
    background-size: 200% 200%;
    animation: placeholderShimmer 1.5s ease-in-out infinite;
}

@keyframes placeholderShimmer {
    0%, 100% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
}

/* 视频笔记标志样式 */
.video-indicator {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 20px;
    height: 20px;
    background: rgba(0, 0, 0, 0.323);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    z-index: 2;
    backdrop-filter: blur(4px);
    transition: all 0.2s ease;
}

/* 封面图片 - 绝对定位填充 padding-top 容器 */
.content-image {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: block;
    border-radius: 10px;
    object-fit: cover;
    object-position: center;
    transition: filter 0.8s ease, opacity 0.25s ease;
}

.content-image:hover {
    filter: brightness(0.7);
}

/* 懒加载头像样式 */
.lazy-avatar {
    transition: opacity 0.3s ease;
    opacity: 1;
    visibility: visible;
}

.lazy-avatar.fade-in {
    opacity: 1 !important;
    visibility: visible !important;
}

.content-title {
    margin: 0;
    padding: 8px 12px 4px 12px;
    font-size: 14px;
    color: var(--text-color-primary);
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    line-height: 1.4;
}

.contentlist {
    display: flex;
    align-items: center;
    padding: 6px 12px 12px 12px;
}

.contentlist img {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    margin-right: 8px;
    flex-shrink: 0;
}

.contentlist-info {
    flex: 1;
    min-width: 0;
}

.contentlist-time {
    font-size: 11px;
    color: var(--text-color-quaternary);
    margin-top: 1px;
}

.clickable-avatar {
    cursor: pointer;
}

.contentlist-name {
    font-size: 12px;
    color: var(--text-color-secondary);
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
    flex: 1;
}

.clickable-name {
    cursor: pointer;
    transition: color 0.2s ease;
}

.clickable-name:hover {
    color: var(--text-color-primary);
}

.action-wrapper {
    display: flex;
    align-items: center;
    margin-left: auto;
}

.like-num-wrapper {
    display: flex;
    align-items: center;
    gap: 4px;
}

.like-num {
    font-size: 12px;
    color: var(--text-color-secondary);
}

/* 加载更多指示器 */
.load-more-indicator {
    position: relative;
    padding: 8px 0;
    display: flex;
    justify-content: center;
    align-items: center;
    background: transparent;
    pointer-events: none;
    z-index: 10;
}

.load-more-indicator.no-more-content {
    padding: 40px 0 24px 0;
    min-height: auto;
}

.loading-more {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 10px;
}

.loading-text {
    color: var(--text-color-secondary);
    font-size: 14px;
}

.no-more {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 10px 0;
}

.no-more-text {
    color: var(--text-color-tertiary);
    font-size: 12px;
    position: relative;
}

.no-more-text::before,
.no-more-text::after {
    content: '';
    position: absolute;
    top: 50%;
    width: 40px;
    height: 1px;
    background: var(--border-color-secondary);
}

.no-more-text::before {
    right: 100%;
    margin-right: 10px;
}

.no-more-text::after {
    left: 100%;
    margin-left: 10px;
}



/* 响应式设计 */
@media (min-width: 1200px) {
    .waterfall-grid {
        grid-template-columns: repeat(5, 1fr);
        gap: 24px;
    }
}

@media (min-width: 900px) and (max-width: 1199px) {
    .waterfall-grid {
        grid-template-columns: repeat(4, 1fr);
        gap: 20px;
    }
}

@media (min-width: 650px) and (max-width: 899px) {
    .waterfall-grid {
        grid-template-columns: repeat(3, 1fr);
        gap: 16px;
    }
}

@media (max-width: 649px) {
    .waterfall-grid {
        grid-template-columns: repeat(2, 1fr);
        gap: 12px;
    }

    .content-title {
        font-size: 13px;
    }

    .contentlist-name {
        font-size: 11px;
    }
}
</style>