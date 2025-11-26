import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { isMobile } from "@/utils/responsive";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface MobileSelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

interface MobileSelectContextValue {
  value: string;
  onValueChange: (value: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
}

const MobileSelectContext = React.createContext<MobileSelectContextValue | null>(null);

const useMobileSelectContext = () => {
  const context = React.useContext(MobileSelectContext);
  if (!context) {
    throw new Error("MobileSelect components must be used within MobileSelect");
  }
  return context;
};

const MobileSelect = React.forwardRef<
  HTMLButtonElement,
  MobileSelectProps
>(({ value, onValueChange, placeholder, children, className, disabled, ...props }, ref) => {
  const [open, setOpen] = React.useState(false);
  const isMobileDevice = isMobile();

  const contextValue = React.useMemo(
    () => ({
      value: value || "",
      onValueChange: (newValue: string) => {
        onValueChange?.(newValue);
        setOpen(false);
      },
      open,
      setOpen,
    }),
    [value, onValueChange, open]
  );

  const selectedLabel = React.useMemo(() => {
    if (!value) return placeholder;
    const childrenArray = React.Children.toArray(children);
    for (const child of childrenArray) {
      if (React.isValidElement(child) && child.type === MobileSelectItem) {
        if (child.props.value === value) {
          return child.props.children;
        }
      }
    }
    return placeholder;
  }, [value, placeholder, children]);

  if (!isMobileDevice) {
    // On desktop, use regular select
    return (
      <select
        ref={ref as any}
        value={value}
        onChange={(e) => onValueChange?.(e.target.value)}
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        disabled={disabled}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {React.Children.map(children, (child) => {
          if (React.isValidElement(child) && child.type === MobileSelectItem) {
            return (
              <option value={child.props.value} disabled={child.props.disabled}>
                {child.props.children}
              </option>
            );
          }
          return null;
        })}
      </select>
    );
  }

  return (
    <MobileSelectContext.Provider value={contextValue}>
      <Button
        ref={ref}
        type="button"
        variant="outline"
        role="combobox"
        aria-expanded={open}
        className={cn(
          "w-full justify-between font-normal",
          !value && "text-muted-foreground",
          className
        )}
        onClick={() => setOpen(true)}
        disabled={disabled}
        {...props}
      >
        <span className="truncate">{selectedLabel || placeholder}</span>
        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80vh] p-0 sm:max-w-[425px]">
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <DialogTitle>{placeholder || "Select an option"}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="p-2">{children}</div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </MobileSelectContext.Provider>
  );
});
MobileSelect.displayName = "MobileSelect";

const MobileSelectItem = React.forwardRef<
  HTMLDivElement,
  {
    value: string;
    children: React.ReactNode;
    disabled?: boolean;
    className?: string;
  }
>(({ value, children, disabled, className, ...props }, ref) => {
  const { value: selectedValue, onValueChange, setOpen } = useMobileSelectContext();
  const isSelected = selectedValue === value;

  return (
    <div
      ref={ref}
      role="option"
      aria-selected={isSelected}
      className={cn(
        "relative flex min-h-[48px] cursor-pointer select-none items-center rounded-md px-4 py-3 text-sm outline-none transition-colors",
        "focus:bg-accent focus:text-accent-foreground",
        isSelected && "bg-accent text-accent-foreground",
        disabled && "pointer-events-none opacity-50",
        className
      )}
      onClick={() => {
        if (!disabled) {
          onValueChange(value);
        }
      }}
      {...props}
    >
      <div className="flex items-center justify-between w-full">
        <span className="flex-1">{children}</span>
        {isSelected && <Check className="h-5 w-5 text-primary" />}
      </div>
    </div>
  );
});
MobileSelectItem.displayName = "MobileSelectItem";

export { MobileSelect, MobileSelectItem };

