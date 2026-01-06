// Stub file for unused AddHomeForm component
import * as yup from 'yup'

export const homeSchema = yup.object({
  title: yup.string().required(),
  description: yup.string().required(),
  price: yup.number().required(),
  country: yup.string().required(),
  state: yup.string(),
  city: yup.string(),
  image: yup.mixed(),
  categories: yup.array().of(yup.string()).required(),
})

export type homeSchemaType = yup.InferType<typeof homeSchema>
