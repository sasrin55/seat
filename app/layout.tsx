export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui", margin: 0 }}>
        <div style={{ padding: 16, maxWidth: 1100, margin: "0 auto" }}>
          {children}
        </div>
      </body>
    </html>
  );
}
