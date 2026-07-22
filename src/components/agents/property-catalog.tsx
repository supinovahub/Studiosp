'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import {
  Building2,
  CheckCircle2,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

interface ProductMedia {
  id: string;
  url: string;
  caption: string | null;
  is_cover: boolean;
  sort_order: number;
}

interface Product {
  id: string;
  sku: string | null;
  name: string;
  development_name: string | null;
  property_type: string;
  availability_status: string;
  description: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  price: number | null;
  area_m2: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  parking_spaces: number | null;
  features: string[];
  payment_terms: string | null;
  public_url: string | null;
  knowledge_status?: 'pending' | 'processing' | 'ready' | 'error';
  knowledge_error?: string | null;
  product_media: ProductMedia[];
}

interface FormState {
  sku: string;
  name: string;
  development_name: string;
  property_type: string;
  availability_status: string;
  description: string;
  neighborhood: string;
  city: string;
  state: string;
  price: string;
  area_m2: string;
  bedrooms: string;
  bathrooms: string;
  parking_spaces: string;
  features: string;
  payment_terms: string;
  public_url: string;
}

const EMPTY_FORM: FormState = {
  sku: '',
  name: '',
  development_name: '',
  property_type: 'studio',
  availability_status: 'available',
  description: '',
  neighborhood: '',
  city: 'São Paulo',
  state: 'SP',
  price: '',
  area_m2: '',
  bedrooms: '1',
  bathrooms: '1',
  parking_spaces: '0',
  features: '',
  payment_terms: '',
  public_url: '',
};

const STATUS_LABEL: Record<string, string> = {
  available: 'Disponível',
  reserved: 'Reservado',
  sold: 'Vendido',
  inactive: 'Inativo',
};

function numberOrNull(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function toForm(product: Product): FormState {
  return {
    sku: product.sku ?? '',
    name: product.name,
    development_name: product.development_name ?? '',
    property_type: product.property_type,
    availability_status: product.availability_status,
    description: product.description ?? '',
    neighborhood: product.neighborhood ?? '',
    city: product.city ?? '',
    state: product.state ?? '',
    price: product.price?.toString() ?? '',
    area_m2: product.area_m2?.toString() ?? '',
    bedrooms: product.bedrooms?.toString() ?? '',
    bathrooms: product.bathrooms?.toString() ?? '',
    parking_spaces: product.parking_spaces?.toString() ?? '',
    features: product.features?.join(', ') ?? '',
    payment_terms: product.payment_terms ?? '',
    public_url: product.public_url ?? '',
  };
}

function money(value: number | null) {
  if (value === null) return 'Preço sob consulta';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(value);
}

export function PropertyCatalog({ canEdit }: { canEdit: boolean }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (status !== 'all') params.set('status', status);
      const response = await fetch(`/api/products?${params}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Falha ao carregar imóveis.');
      setProducts(body.products ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao carregar imóveis.');
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  const totals = {
    all: products.length,
    ready: products.filter((item) => item.knowledge_status === 'ready').length,
    available: products.filter((item) => item.availability_status === 'available').length,
  };

  function openNew() {
    setForm(EMPTY_FORM);
    setFiles([]);
    setEditing('new');
  }

  function openEdit(product: Product) {
    setForm(toForm(product));
    setFiles([]);
    setEditing(product);
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function uploadFiles(productId: string, existingMedia: ProductMedia[]) {
    for (let index = 0; index < files.length; index += 1) {
      const payload = new FormData();
      payload.set('file', files[index]);
      payload.set('is_cover', String(existingMedia.length === 0 && index === 0));
      const response = await fetch(`/api/products/${productId}/media`, {
        method: 'POST',
        body: payload,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? `Falha no upload de ${files[index].name}.`);
    }
  }

  async function save() {
    if (!form.name.trim()) {
      toast.error('Informe o nome do imóvel.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        sku: form.sku.trim() || null,
        development_name: form.development_name.trim() || null,
        description: form.description.trim() || null,
        neighborhood: form.neighborhood.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim().toUpperCase() || null,
        price: numberOrNull(form.price),
        area_m2: numberOrNull(form.area_m2),
        bedrooms: numberOrNull(form.bedrooms),
        bathrooms: numberOrNull(form.bathrooms),
        parking_spaces: numberOrNull(form.parking_spaces),
        features: form.features.split(',').map((item) => item.trim()).filter(Boolean),
        payment_terms: form.payment_terms.trim() || null,
        public_url: form.public_url.trim() || null,
      };
      const isNew = editing === 'new';
      const response = await fetch(
        isNew ? '/api/products' : `/api/products/${(editing as Product).id}`,
        {
          method: isNew ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Falha ao salvar imóvel.');
      const product = body.product as Product;
      if (files.length) await uploadFiles(product.id, product.product_media ?? []);
      if (body.indexingWarning) toast.warning('Imóvel salvo; a indexação poderá ser reprocessada.');
      else toast.success(isNew ? 'Imóvel cadastrado.' : 'Imóvel atualizado.');
      setEditing(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao salvar imóvel.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(product: Product) {
    if (!window.confirm(`Excluir “${product.name}”? Esta ação não pode ser desfeita.`)) return;
    const response = await fetch(`/api/products/${product.id}`, { method: 'DELETE' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(body.error ?? 'Falha ao excluir imóvel.');
      return;
    }
    toast.success('Imóvel excluído.');
    setProducts((current) => current.filter((item) => item.id !== product.id));
  }

  async function removeMedia(productId: string, mediaId: string) {
    const response = await fetch(`/api/products/${productId}/media/${mediaId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      toast.error(body.error ?? 'Falha ao excluir foto.');
      return;
    }
    setEditing((current) => {
      if (!current || current === 'new') return current;
      return {
        ...current,
        product_media: current.product_media.filter((item) => item.id !== mediaId),
      };
    });
    toast.success('Foto removida.');
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-muted-foreground text-xs">Imóveis encontrados</p><p className="mt-1 text-2xl font-semibold">{totals.all}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-muted-foreground text-xs">Disponíveis</p><p className="mt-1 text-2xl font-semibold">{totals.available}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-muted-foreground text-xs">Prontos para a IA</p><p className="mt-1 text-2xl font-semibold">{totals.ready}</p></CardContent></Card>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome, empreendimento, bairro ou SKU" className="pl-9" />
        </div>
        <Select value={status} onValueChange={(value) => value && setStatus(value)}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="available">Disponíveis</SelectItem>
            <SelectItem value="reserved">Reservados</SelectItem>
            <SelectItem value="sold">Vendidos</SelectItem>
            <SelectItem value="inactive">Inativos</SelectItem>
          </SelectContent>
        </Select>
        {canEdit && <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Novo imóvel</Button>}
      </div>

      {loading ? (
        <div className="text-muted-foreground flex items-center justify-center py-16"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Carregando catálogo…</div>
      ) : products.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center py-16 text-center"><Building2 className="text-muted-foreground h-10 w-10" /><h3 className="mt-4 font-medium">Nenhum imóvel encontrado</h3><p className="text-muted-foreground mt-1 max-w-md text-sm">Cadastre o primeiro imóvel para que o agente possa recomendá-lo aos clientes.</p>{canEdit && <Button className="mt-4" onClick={openNew}><Plus className="mr-2 h-4 w-4" />Cadastrar imóvel</Button>}</CardContent></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {products.map((product) => {
            const cover = [...(product.product_media ?? [])].sort((a, b) => Number(b.is_cover) - Number(a.is_cover) || a.sort_order - b.sort_order)[0];
            return (
              <Card key={product.id} className="overflow-hidden">
                <CardContent className="flex gap-4 p-4">
                  <div className="bg-muted relative h-28 w-28 shrink-0 overflow-hidden rounded-lg">
                    {cover ? <Image unoptimized fill sizes="112px" src={cover.url} alt={cover.caption ?? product.name} className="object-cover" /> : <div className="text-muted-foreground flex h-full items-center justify-center"><ImagePlus className="h-7 w-7" /></div>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div><h3 className="truncate font-semibold">{product.name}</h3><p className="text-muted-foreground truncate text-sm">{product.development_name || [product.neighborhood, product.city].filter(Boolean).join(', ') || 'Localização não informada'}</p></div>
                      {canEdit && <div className="flex"><Button variant="ghost" size="icon" onClick={() => openEdit(product)} aria-label="Editar"><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => void remove(product)} aria-label="Excluir"><Trash2 className="text-destructive h-4 w-4" /></Button></div>}
                    </div>
                    <p className="mt-3 font-medium">{money(product.price)}</p>
                    <p className="text-muted-foreground mt-1 text-xs">{[product.area_m2 && `${product.area_m2} m²`, product.bedrooms !== null && `${product.bedrooms} dorm.`, product.parking_spaces !== null && `${product.parking_spaces} vaga(s)`].filter(Boolean).join(' • ')}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2"><Badge variant={product.availability_status === 'available' ? 'default' : 'secondary'}>{STATUS_LABEL[product.availability_status] ?? product.availability_status}</Badge>{product.knowledge_status === 'ready' ? <span className="flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" />IA pronta</span> : product.knowledge_status === 'error' ? <span className="flex items-center gap-1 text-xs text-amber-600" title={product.knowledge_error ?? undefined}><TriangleAlert className="h-3.5 w-3.5" />Falha na indexação</span> : <span className="text-muted-foreground text-xs">Indexação pendente</span>}</div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader><DialogTitle>{editing === 'new' ? 'Novo imóvel' : 'Editar imóvel'}</DialogTitle><DialogDescription>As informações salvas serão preparadas automaticamente para consulta pelo agente.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <Field label="Nome *"><Input value={form.name} onChange={(e) => setField('name', e.target.value)} placeholder="Studio Vila Mariana 804" /></Field>
            <Field label="Empreendimento"><Input value={form.development_name} onChange={(e) => setField('development_name', e.target.value)} placeholder="Viva Mariana" /></Field>
            <Field label="Código / SKU"><Input value={form.sku} onChange={(e) => setField('sku', e.target.value)} /></Field>
            <Field label="Status"><Select value={form.availability_status} onValueChange={(v) => v && setField('availability_status', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="available">Disponível</SelectItem><SelectItem value="reserved">Reservado</SelectItem><SelectItem value="sold">Vendido</SelectItem><SelectItem value="inactive">Inativo</SelectItem></SelectContent></Select></Field>
            <Field label="Preço (R$)"><Input inputMode="decimal" value={form.price} onChange={(e) => setField('price', e.target.value)} /></Field>
            <Field label="Área privativa (m²)"><Input inputMode="decimal" value={form.area_m2} onChange={(e) => setField('area_m2', e.target.value)} /></Field>
            <Field label="Bairro"><Input value={form.neighborhood} onChange={(e) => setField('neighborhood', e.target.value)} /></Field>
            <div className="grid grid-cols-[1fr_80px] gap-2"><Field label="Cidade"><Input value={form.city} onChange={(e) => setField('city', e.target.value)} /></Field><Field label="UF"><Input maxLength={2} value={form.state} onChange={(e) => setField('state', e.target.value)} /></Field></div>
            <div className="grid grid-cols-3 gap-2 sm:col-span-2"><Field label="Dormitórios"><Input inputMode="numeric" value={form.bedrooms} onChange={(e) => setField('bedrooms', e.target.value)} /></Field><Field label="Banheiros"><Input inputMode="numeric" value={form.bathrooms} onChange={(e) => setField('bathrooms', e.target.value)} /></Field><Field label="Vagas"><Input inputMode="numeric" value={form.parking_spaces} onChange={(e) => setField('parking_spaces', e.target.value)} /></Field></div>
            <Field label="Descrição" className="sm:col-span-2"><Textarea rows={4} value={form.description} onChange={(e) => setField('description', e.target.value)} placeholder="Descrição comercial e principais argumentos de venda" /></Field>
            <Field label="Diferenciais (separados por vírgula)" className="sm:col-span-2"><Input value={form.features} onChange={(e) => setField('features', e.target.value)} placeholder="coworking, academia, próximo ao metrô" /></Field>
            <Field label="Condições de pagamento" className="sm:col-span-2"><Textarea rows={2} value={form.payment_terms} onChange={(e) => setField('payment_terms', e.target.value)} /></Field>
            <Field label="Link público do imóvel" className="sm:col-span-2"><Input type="url" value={form.public_url} onChange={(e) => setField('public_url', e.target.value)} placeholder="https://…" /></Field>
            <Field label="Fotos" className="sm:col-span-2"><Input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []))} /><p className="text-muted-foreground mt-1 text-xs">JPG, PNG, WebP ou GIF; até 10 MB por foto. A primeira imagem será a capa.</p></Field>
            {editing !== 'new' && editing?.product_media?.length ? <div className="sm:col-span-2"><Label>Fotos atuais</Label><div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">{editing.product_media.map((media) => <div key={media.id} className="group relative aspect-square overflow-hidden rounded-md"><Image unoptimized fill sizes="(max-width: 640px) 33vw, 140px" src={media.url} alt={media.caption ?? 'Foto do imóvel'} className="object-cover" /><Button type="button" variant="destructive" size="icon" className="absolute top-1 right-1 h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100" onClick={() => void removeMedia(editing.id, media.id)} aria-label="Remover foto"><Trash2 className="h-3.5 w-3.5" /></Button></div>)}</div></div> : null}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>Cancelar</Button><Button onClick={() => void save()} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar imóvel</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return <div className={className}><Label className="mb-1.5 block">{label}</Label>{children}</div>;
}
