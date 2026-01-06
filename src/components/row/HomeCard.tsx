import { getImageUrl } from '@/lib/utils'
import Image from 'next/image'
import Link from 'next/link'
import React from 'react'
import HeartButton from '@/components/HeartButton'

interface HomesType {
  id: string | number;
  title: string;
  city: string;
  country: string;
  price: number;
  image: string | null;
}

const HomeCard = ({ home }: { home: HomesType }) => {
    return (
        <Link href={`/home/${home.id}`} className="block">
            <div className="relative overflow-hidden rounded-xl aspect-square">
                <Image
                    src={getImageUrl(home.image)}
                    alt={`${home.title} in ${home.city}, ${home.country}`}
                    fill
                    className="object-cover w-full h-full transition group-hover:scale-110"
                />
                <div className="absolute top-3 right-3">
                    <HeartButton listingId={home.id} currentUser={null} />
                </div>
            </div>
            <div className="mt-1">
                <div className="font-semibold text-neutral-900">
                    {home.city}, {home.country}
                </div>
                <div className="font-light text-neutral-500">
                    {home.title}
                </div>
                <div className="flex flex-row items-center gap-1">
                    <div className="font-semibold text-neutral-900">${home.price}</div>
                    <div className="font-light text-neutral-600"> / night</div>
                </div>
            </div>
        </Link>
    );
}

export default HomeCard
