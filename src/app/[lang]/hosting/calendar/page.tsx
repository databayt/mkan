import NotificationCard from '@/components/hosting/notification-card'
import React from 'react'

const page = () => {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <NotificationCard
            subtitle="hello mkan"
            title="Confirm a few key details"
            description="Required to publish"
          />
    </div>
  )
}

export default page