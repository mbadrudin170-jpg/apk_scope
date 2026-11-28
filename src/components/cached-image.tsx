import { Image, type ImageProps } from "expo-image";

export type CachedImageProps = ImageProps;

export function CachedImage(props: CachedImageProps) {
  return <Image {...props} cachePolicy="memory-disk" />;
}
