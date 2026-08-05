import Document, { Html, Head, Main, NextScript } from "next/document"

class MyDocument extends Document {
    render() {
        return (
            <Html lang="es">
                <Head>
                    <link rel="preconnect" href="https://fonts.bunny.net" />
                    <link href="https://fonts.bunny.net/css?family=epilogue:400,500,600,700" rel="stylesheet" />
                </Head>
                <body>
                    <Main />
                    <NextScript />
                </body>
            </Html>
        )
    }
}
export default MyDocument
