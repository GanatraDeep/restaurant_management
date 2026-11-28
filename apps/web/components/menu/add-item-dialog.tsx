"use client";

import { ImagePlus, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ItemAddOnsField } from "@/components/menu/add-ons-dialog";
import { routeFields, TicketRouteField, type TicketRoute } from "@/components/menu/ticket-route";
import { draftsToVariants, VariantsEditor, type VariantDraft } from "@/components/menu/variants-editor";
import {
  useCreateMenuItem,
  useStations,
  useUploadItemImage,
  type MenuCategory,
} from "@/hooks/use-menu";
import { useSettings } from "@/hooks/use-settings";
import { ApiError } from "@/lib/api";

export function AddItemDialog({
  branchId,
  categories,
}: {
  branchId: string | null;
  categories: MenuCategory[];
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [takeawayCharge, setTakeawayCharge] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [stationId, setStationId] = useState<string>("");
  const [addOns, setAddOns] = useState<string[]>([]);
  const [price, setPrice] = useState("");
  const [halfPrice, setHalfPrice] = useState("");
  const [variants, setVariants] = useState<VariantDraft[]>([]);
  const hasVariants = variants.length > 0;
  const [taxRatePercent, setTaxRatePercent] = useState("5");
  const [isVeg, setIsVeg] = useState(true);
  const [ticketRoute, setTicketRoute] = useState<TicketRoute>("KITCHEN");
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);
  const [imagePreview, setImagePreview] = useState<string | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: stations } = useStations(branchId);
  const { data: settings } = useSettings(branchId);
  const createItem = useCreateMenuItem(branchId);
  const uploadImage = useUploadItemImage();
  const priceLabel =
    settings?.branch.taxMode === "EXCLUSIVE" ? "Price (excl. tax)" : "Price (incl. tax)";

  const reset = () => {
    setName("");
    setCategoryId("");
    setStationId("");
    setPrice("");
    setHalfPrice("");
    setVariants([]);
    setTaxRatePercent("5");
    setIsVeg(true);
    setTicketRoute("KITCHEN");
    setDescription("");
    setTakeawayCharge("");
    setImageUrl(undefined);
    setImagePreview(undefined);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImagePreview(URL.createObjectURL(file));
    uploadImage.mutate(file, {
      onSuccess: (res) => setImageUrl(res.url),
      onError: (err) => {
        toast.error(err instanceof ApiError ? err.message : "Could not upload image");
        setImagePreview(undefined);
      },
    });
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryId) {
      toast.error("Choose a category");
      return;
    }
    const v = draftsToVariants(variants);
    if ("error" in v) {
      toast.error(v.error);
      return;
    }
    createItem.mutate(
      {
        name,
        description: description.trim() || undefined,
        categoryId,
        stationId: stationId || undefined,
        // With variants the first one's rate is the item's price.
        price: v.variants.length ? v.variants[0].price : Number(price),
        halfPrice: v.variants.length || halfPrice.trim() === "" ? undefined : Number(halfPrice),
        variants: v.variants,
        taxRatePercent: Number(taxRatePercent),
        isVeg,
        isVegan: false,
        isJain: false,
        isHalal: false,
        isGlutenFree: false,
        spiceLevel: "NONE",
        allergens: [],
        isActive: true,
        isFavorite: false,
        ...routeFields(ticketRoute),
        takeawayCharge: takeawayCharge.trim() === "" ? null : Number(takeawayCharge),
        modifierGroupIds: addOns,
        imageUrl,
      },
      {
        onSuccess: () => {
          toast.success(`"${name}" added to menu`);
          setOpen(false);
          reset();
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not add item"),
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm" disabled={categories.length === 0}>
            Add item
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>New menu item</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label>Photo</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={onFileChange}
            />
            {imagePreview ? (
              <div className="relative h-28 w-28 overflow-hidden rounded-lg border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element -- local blob/uploaded preview, not a Next-optimizable remote asset */}
                <img src={imagePreview} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => {
                    setImageUrl(undefined);
                    setImagePreview(undefined);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-background/80 text-foreground"
                  aria-label="Remove photo"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                {uploadImage.isPending && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/60 text-xs">
                    Uploading…
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-28 w-28 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary"
              >
                <ImagePlus className="h-5 w-5" />
                <span className="text-xs">Add photo</span>
              </button>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="item-name">Name</Label>
            <Input
              id="item-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Margherita Pizza"
              required
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="item-description">Description (optional)</Label>
            <Textarea
              id="item-description"
              rows={3}
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Fresh mozzarella, basil and tomato on a thin crust"
            />
            <p className="text-xs text-muted-foreground">Shown under the item on the QR menu and online ordering.</p>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Category</Label>
            <Select value={categoryId} onValueChange={(v) => setCategoryId(v ?? "")}>
              <SelectTrigger>
                <SelectValue placeholder="Select category">
                  {(value: string | null) => categories.find((c) => c.id === value)?.name ?? "Select category"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {hasVariants ? (
              <div className="flex flex-col gap-2">
                <Label>Price</Label>
                <p className="flex h-9 items-center text-sm text-muted-foreground">Set for each variant below</p>
              </div>
            ) : (
            <div className="flex flex-col gap-2">
              <Label htmlFor="price">{priceLabel}</Label>
              <Input
                id="price"
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required={!hasVariants}
              />
            </div>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="tax">Tax rate %</Label>
              <Input
                id="tax"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={taxRatePercent}
                onChange={(e) => setTaxRatePercent(e.target.value)}
                required
              />
            </div>
          </div>

          {!hasVariants && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="add-half">Half portion price (optional)</Label>
            <Input
              id="add-half"
              type="number"
              min="0"
              step="0.01"
              value={halfPrice}
              onChange={(e) => setHalfPrice(e.target.value)}
              placeholder="Leave empty if there is no half/full choice"
            />
            <p className="text-xs text-muted-foreground">
              When set, the POS asks Half / Full / Custom. The price above is the Full portion.
            </p>
          </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="item-takeaway">Takeaway charge (optional)</Label>
            <Input
              id="item-takeaway"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={takeawayCharge}
              onChange={(e) => setTakeawayCharge(e.target.value)}
              placeholder="Empty = use the category's charge"
            />
            <p className="text-xs text-muted-foreground">Per unit on takeaway bills. Enter 0 for no charge on this item.</p>
          </div>

          <VariantsEditor idPrefix="add" value={variants} onChange={setVariants} />

          <div className="flex flex-col gap-2">
            <Label>Kitchen station</Label>
            <Select value={stationId} onValueChange={(v) => setStationId(v ?? "")}>
              <SelectTrigger>
                <SelectValue placeholder="None">
                  {(value: string | null) => stations?.find((st) => st.id === value)?.name ?? "None"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {stations?.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
            <Label htmlFor="is-veg" className="cursor-pointer">
              Vegetarian
            </Label>
            <Switch id="is-veg" checked={isVeg} onCheckedChange={setIsVeg} />
          </div>

          <TicketRouteField idPrefix="add" value={ticketRoute} onChange={setTicketRoute} />

          {branchId && <ItemAddOnsField branchId={branchId} value={addOns} onChange={setAddOns} />}

          <DialogFooter>
            <Button type="submit" disabled={createItem.isPending || uploadImage.isPending}>
              {createItem.isPending ? "Adding…" : "Add item"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
