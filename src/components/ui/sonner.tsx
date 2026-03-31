import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        className: "border-2 !border-[var(--neo-border-color)] !rounded-xl !shadow-[4px_4px_0px_0px_var(--neo-border-color)] !font-bold",
      }}
      style={
        {
          "--normal-bg": "var(--build-chat-colors-bg-4)",
          "--normal-text": "var(--build-chat-colors-text-primary)",
          "--normal-border": "var(--neo-border-color)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
