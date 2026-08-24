import { useState } from "react";
import { format, differenceInDays, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar as CalendarIcon, ChevronDown, Check } from "lucide-react";
import { DateRange } from "react-day-picker";
import { useFilters, type PresetPeriod } from "@/lib/filters-context";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

const presets: { value: PresetPeriod; label: string }[] = [
  { value: "today", label: "Hoje" },
  { value: "yesterday", label: "Ontem" },
  { value: "7d", label: "Últimos 7 dias" },
  { value: "14d", label: "Últimos 14 dias" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "this_week", label: "Esta semana" },
  { value: "last_week", label: "Semana passada" },
  { value: "month", label: "Este mês" },
  { value: "last_month", label: "Mês passado" },
  { value: "year", label: "Este ano" },
  { value: "custom", label: "Personalizado" },
];

export function DashboardDateFilter() {
  const f = useFilters();
  const [open, setOpen] = useState(false);
  const [tempRange, setTempRange] = useState<DateRange | undefined>({
    from: f.from,
    to: f.to,
  });

  const activeLabel = presets.find((p) => p.value === f.preset)?.label || "Personalizado";

  const handlePresetSelect = (preset: PresetPeriod) => {
    f.setPreset(preset);
    if (preset !== "custom") {
      setOpen(false);
    }
  };

  const handleApplyCustom = () => {
    if (tempRange?.from && tempRange?.to) {
      f.setRange(tempRange.from, tempRange.to);
      setOpen(false);
    }
  };

  const diff = differenceInDays(f.to, f.from) + 1;
  const prevFrom = subDays(f.from, diff);
  const prevTo = subDays(f.to, diff);
  
  // Custom range limit check
  const isRangeTooLarge = tempRange?.from && tempRange?.to && differenceInDays(tempRange.to, tempRange.from) > 180;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "h-10 justify-start text-left font-normal px-3 bg-card border-border hover:bg-accent/50 transition-all shadow-sm",
              "w-full sm:w-[280px]"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
            <div className="flex flex-col items-start leading-none">
              <span className="text-xs font-semibold text-primary">{activeLabel}</span>
              <span className="text-[11px] text-muted-foreground mt-0.5">
                {format(f.from, "dd/MM/yy")} — {format(f.to, "dd/MM/yy")}
              </span>
            </div>
            <ChevronDown className="ml-auto h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 flex flex-col sm:flex-row" align="start">
          <div className="w-full sm:w-48 border-b sm:border-b-0 sm:border-r border-border">
            <ScrollArea className="h-[300px] sm:h-[400px]">
              <div className="p-2 space-y-1">
                {presets.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => handlePresetSelect(p.value)}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 text-sm rounded-md transition-colors text-left",
                      f.preset === p.value
                        ? "bg-primary/10 text-primary font-medium"
                        : "hover:bg-accent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {p.label}
                    {f.preset === p.value && <Check className="h-4 w-4" />}
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
          <div className="p-3 space-y-3">
            <Calendar
              mode="range"
              defaultMonth={f.from}
              selected={tempRange}
              onSelect={setTempRange}
              numberOfMonths={2}
              locale={ptBR}
              className="p-0"
              disabled={(date) => date > new Date()}
            />
            
            {isRangeTooLarge && (
              <p className="text-[11px] text-destructive font-medium px-1">
                Limite máximo: 180 dias. Selecione um período menor.
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setOpen(false)}
              >
                Cancelar
              </Button>
              <Button 
                size="sm" 
                onClick={handleApplyCustom}
                disabled={!tempRange?.from || !tempRange?.to || isRangeTooLarge}
              >
                Aplicar
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <div className="flex flex-col leading-tight">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Comparativo anterior</span>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          vs {format(prevFrom, "dd/MM")} a {format(prevTo, "dd/MM")}
        </span>
      </div>
    </div>
  );
}