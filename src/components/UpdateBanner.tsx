import { useRegisterSW } from 'virtual:pwa-register/react'

const CHECK_EVERY_MS = 60 * 60 * 1000

// Shows a bar when a new version has been downloaded; tapping it switches to the new version.
export default function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return
      // the app can stay open for days, so look for a new version now and then and whenever it comes back to the screen
      setInterval(() => registration.update(), CHECK_EVERY_MS)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration.update()
      })
    },
  })

  if (!needRefresh) return null
  return (
    <div className="flex items-center gap-2 bg-indigo-700 px-4 py-2 text-sm text-white">
      <span className="flex-1">새 버전이 있습니다.</span>
      <button onClick={() => setNeedRefresh(false)} className="px-2 py-1 text-indigo-100">
        나중에
      </button>
      <button onClick={() => updateServiceWorker(true)} className="rounded-lg bg-white px-3 py-1 font-semibold text-indigo-800">
        지금 적용
      </button>
    </div>
  )
}
