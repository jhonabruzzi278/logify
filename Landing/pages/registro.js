export default function Registro() { return null }

// La identidad se crea/autentica en el mismo origen que la aplicación. Así
// una cuenta existente nunca vuelve a escribir una contraseña que sería
// ignorada, y una cuenta nueva queda bajo control exclusivo de su dueño.
export function getServerSideProps() {
    return {
        redirect: {
            destination: "https://app.logify.cl/create-organization",
            permanent: false,
        },
    }
}
