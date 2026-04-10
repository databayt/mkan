import Image from "next/image"
import { Star } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

interface AirbnbReviewProps {
  reviewerName: string;
  reviewerLocation: string;
  reviewerImage: string;
  rating: number;
  date: string;
  stayDuration: string;
  reviewText: string;
  className?: string;
}

export default function AirbnbReview({
  reviewerName,
  reviewerLocation,
  reviewerImage,
  rating,
  date,
  stayDuration,
  reviewText,
  className = ""
}: AirbnbReviewProps) {
  return (
    <div className={`max-w-md mx-auto ${className}`}>
      <Card className="border-0 shadow-none bg-transparent">
        <CardContent className="p-0">
          <div className="space-y-3">
            {/* Profile Image, Name and Country in a row */}
            <div className="flex items-center gap-4">
              {/* Profile Image */}
              <div className="flex-shrink-0">
                <Image
                  src={reviewerImage}
                  alt={`${reviewerName}'s profile picture`}
                  width={60}
                  height={60}
                  className="rounded-full object-cover"
                />
              </div>

              {/* Name and Country */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">{reviewerName}</h3>
                <p className="text-sm text-gray-600">{reviewerLocation}</p>
              </div>
            </div>

            {/* Rating and Date */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                {[...Array(5)].map((_, i) => (
                  <Star 
                    key={i} 
                    className={`w-4 h-4 ${i < rating ? 'fill-black text-black' : 'text-gray-300'}`} 
                  />
                ))}
              </div>
              <span className="text-sm text-gray-600">·</span>
              <span className="text-sm font-medium text-gray-900">{date}</span>
              <span className="text-sm text-gray-600">·</span>
              <span className="text-sm text-gray-600">{stayDuration}</span>
            </div>

            {/* Review Text */}
            <p className="text-sm text-gray-700 leading-relaxed">
              {reviewText}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
