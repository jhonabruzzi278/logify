import Head from "next/head"

// Compatibilidad con invitaciones emitidas mientras APP_URL apuntaba a la
// landing. La pantalla de aceptación vive en el frontend de la aplicación,
// no en este sitio de marketing.
export async function getServerSideProps({ params }) {
    const token = typeof params?.token === "string" ? params.token : ""
    return {
        redirect: {
            destination: `https://app.logify.cl/invite/${encodeURIComponent(token)}`,
            permanent: false,
        },
    }
}

export default function InviteRedirect() {
    return (
        <>
            <Head><title>Redirigiendo a Logify</title></Head>
            <p>Redirigiendo a la aceptación de invitación…</p>
        </>
    )
}
