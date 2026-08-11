import { useEffect } from "react"

export default function QrModel3D({ className = "" }) {
    useEffect(() => {
        import("@google/model-viewer")
    }, [])

    return (
        <model-viewer
            src="/assets/3d/qr-code.glb"
            alt="Código QR 3D de despacho Logify"
            auto-rotate="true"
            rotation-per-second="18deg"
            disable-zoom="true"
            interaction-prompt="none"
            shadow-intensity="0.8"
            exposure="1.1"
            environment-image="neutral"
            className={className}
            style={{ width: "100%", height: "100%", background: "transparent", "--poster-color": "transparent" }}
        />
    )
}
