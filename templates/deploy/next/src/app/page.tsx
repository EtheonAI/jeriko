'use client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Plus } from 'lucide-react'
import { useEffect, useOptimistic, useState, useTransition } from 'react'
import { getStats, incrementAndLog } from './counter'

export default function Home() {
  const [stats, setStats] = useState<{ count: number; recentAccess: { accessed_at: string }[] }>({
    count: 0,
    recentAccess: []
  })
  const [optimisticStats, setOptimisticStats] = useOptimistic(stats)
  const [_, startTransition] = useTransition()

  useEffect(() => {
    getStats().then(setStats)
  }, [])

  const handleClick = async () => {
    startTransition(async () => {
      setOptimisticStats({
        count: optimisticStats.count + 1,
        recentAccess: [{ accessed_at: new Date().toISOString() }, ...optimisticStats.recentAccess.slice(0, 4)]
      })
      const newStats = await incrementAndLog()
      setStats(newStats)
    })
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-8 sm:p-24">
      <Card className="p-6 sm:p-8 w-full max-w-sm">
        <p className="text-2xl font-medium text-center mb-4">Views: {optimisticStats.count}</p>
        <div className="flex justify-center mb-4">
          <Button onClick={handleClick}>
            <Plus className="h-4 w-4 mr-2" />
            Increment
          </Button>
        </div>
        <ScrollArea className="h-[100px]">
          {optimisticStats.recentAccess.map((log, i) => (
            <div key={i} className="text-sm text-muted-foreground text-center">
              {new Date(log.accessed_at).toLocaleString()}
            </div>
          ))}
        </ScrollArea>
      </Card>
    </main>
  )
}
