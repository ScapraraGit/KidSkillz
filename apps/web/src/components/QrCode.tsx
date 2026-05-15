import { useEffect, useRef } from "react";
import QRCode from "qrcode";

interface QrCodeProps {
  value: string;
  size?: number;
  className?: string;
}

export function QrCode({ value, size = 220, className }: QrCodeProps) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    QRCode.toCanvas(ref.current, value, {
      width: size,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#0f172a", light: "#ffffff" },
    }).catch((e) => console.error("[qr]", e));
  }, [value, size]);
  return <canvas ref={ref} className={className} aria-label="QR code" />;
}
