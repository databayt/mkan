import { z } from 'zod'
import { Amenity } from '@prisma/client'

export const amenitiesSchema = z.object({
  amenities: z.array(z.enum(Amenity)).default([]),
})

export type AmenitiesFormData = z.infer<typeof amenitiesSchema> 