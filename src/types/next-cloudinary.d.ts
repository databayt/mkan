// Stub type declarations for next-cloudinary
declare module "next-cloudinary" {
  import { ReactNode, ComponentType } from "react";

  interface CldUploadWidgetProps {
    uploadPreset?: string;
    onUpload?: (result: any) => void;
    onSuccess?: (result: any) => void;
    children?: (props: { open: () => void }) => ReactNode;
    options?: Record<string, any>;
  }

  export const CldUploadWidget: ComponentType<CldUploadWidgetProps>;

  interface CldImageProps {
    src: string;
    width?: number | string;
    height?: number | string;
    alt?: string;
    className?: string;
    crop?: string;
    gravity?: string;
    [key: string]: any;
  }

  export const CldImage: ComponentType<CldImageProps>;
}
