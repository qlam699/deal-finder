"use client";

import { useCallback, useEffect } from "react";
import { ApiKeysPanel } from "@/components/dashboard/api-keys-panel";
import { ProductsPanel } from "@/components/dashboard/products-panel";
import { ScrapeHeader } from "@/components/dashboard/scrape-header";
import { TrashPanel } from "@/components/dashboard/trash-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useApiKeys } from "@/hooks/use-api-keys";
import { useCategories } from "@/hooks/use-categories";
import { useListingCheck } from "@/hooks/use-listing-check";
import { usePriceCheck } from "@/hooks/use-price-check";
import { useProducts } from "@/hooks/use-products";
import { useProductsView } from "@/hooks/use-products-view";
import { useScrapeJob } from "@/hooks/use-scrape-job";
import { useTrashProducts } from "@/hooks/use-trash-products";
import { useUrlPagination } from "@/hooks/use-url-pagination";

export default function Dashboard() {
  const { productsPage, deletedPage, goToProductsPage, goToDeletedPage } =
    useUrlPagination();

  const products = useProducts({ productsPage, goToProductsPage });
  const trash = useTrashProducts({ deletedPage, goToDeletedPage });
  const categories = useCategories();
  const apiKeys = useApiKeys();
  const { productsView, setProductsViewMode } = useProductsView();

  const refreshListAjax = useCallback(async () => {
    await Promise.all([
      products.fetchProducts(),
      trash.fetchDeletedProducts(),
      apiKeys.fetchApiKeys(),
    ]);
  }, [products.fetchProducts, trash.fetchDeletedProducts, apiKeys.fetchApiKeys]);

  const scrape = useScrapeJob({
    apiKeyCount: apiKeys.apiKeys.length,
    goToProductsPage,
    resetSortToNewest: products.resetSortToNewest,
    fetchProducts: products.fetchProducts,
    fetchApiKeys: apiKeys.fetchApiKeys,
    refreshListAjax,
  });

  const listingCheck = useListingCheck({
    scraping: scrape.scraping,
    refreshListAjax,
  });

  const priceCheck = usePriceCheck({
    fetchProducts: products.fetchProducts,
    fetchApiKeys: apiKeys.fetchApiKeys,
  });

  useEffect(() => {
    void categories.fetchCategories();
    void apiKeys.fetchApiKeys();
    void scrape.fetchJobStatus();
    void listingCheck.fetchListingCheckStatus().catch(() => {});
    void priceCheck.hydratePendingPriceChecks();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount bootstrap for non-URL-driven data
  }, []);

  useEffect(() => {
    void products.fetchProducts();
  }, [products.fetchProducts]);

  useEffect(() => {
    void trash.fetchDeletedProducts();
  }, [trash.fetchDeletedProducts]);

  const handleMoveToTrash = useCallback(
    async (id: number) => {
      await products.handleMoveToTrash(id);
      await trash.fetchDeletedProducts();
    },
    [products.handleMoveToTrash, trash.fetchDeletedProducts],
  );

  const handleRestoreProduct = useCallback(
    async (id: number) => {
      await trash.handleRestoreProduct(id);
      await products.fetchProducts();
    },
    [trash.handleRestoreProduct, products.fetchProducts],
  );

  return (
    <TooltipProvider delay={200}>
      <main className="container mx-auto max-w-[1800px] p-6">
        <ScrapeHeader
          jobMessage={scrape.jobMessage}
          categories={categories.categories}
          scrapeSettingsOpen={scrape.scrapeSettingsOpen}
          onScrapeSettingsOpenChange={scrape.setScrapeSettingsOpen}
          scrapeSettings={scrape.scrapeSettings}
          setScrapeSettings={scrape.setScrapeSettings}
          scrapeLimit={scrape.scrapeLimit}
          setScrapeLimit={scrape.setScrapeLimit}
          scraping={scrape.scraping}
          savingScrapeSettings={scrape.savingScrapeSettings}
          cronRunning={scrape.cronRunning}
          canScrape={scrape.canScrape}
          onToggleCategory={categories.handleToggleCategory}
          onSaveScrapeSettings={scrape.handleSaveScrapeSettings}
          onToggleCron={scrape.handleToggleCron}
          onScrape={scrape.handleScrape}
        />

        <Tabs defaultValue="products">
          <TabsList>
            <TabsTrigger value="products">Sản phẩm</TabsTrigger>
            <TabsTrigger value="api-keys">API Keys</TabsTrigger>
            <TabsTrigger value="trash">Thùng rác ({trash.deletedTotal})</TabsTrigger>
          </TabsList>

          <TabsContent value="products">
            <ProductsPanel
              products={products.products}
              categories={categories.categories}
              productsPage={productsPage}
              productsTotalPages={products.productsTotalPages}
              searchInput={products.searchInput}
              onSearchInputChange={products.setSearchInput}
              search={products.search}
              filter={products.filter}
              onFilterChange={products.setCategoryFilter}
              sortBy={products.sortBy}
              sortOrder={products.sortOrder}
              onSort={products.handleSort}
              productImageView={products.productImageView}
              onProductImageViewChange={products.setProductImageView}
              productsView={productsView}
              onProductsViewChange={setProductsViewMode}
              cardIndex={products.cardIndex}
              onCardIndexChange={products.setCardIndex}
              checkingPriceIds={priceCheck.checkingPriceIds}
              onCheckPrice={priceCheck.handleCheckPrice}
              onDelete={handleMoveToTrash}
              onPageChange={goToProductsPage}
              checkingListings={listingCheck.checkingListings}
              listingCheckMessage={listingCheck.listingCheckMessage}
              scraping={scrape.scraping}
              onCheckListings={listingCheck.handleCheckListings}
            />
          </TabsContent>

          <TabsContent value="trash">
            <TrashPanel
              deletedProducts={trash.deletedProducts}
              deletedTotal={trash.deletedTotal}
              deletedPage={deletedPage}
              deletedTotalPages={trash.deletedTotalPages}
              onEmptyTrash={trash.handleEmptyTrash}
              onRestore={handleRestoreProduct}
              onHardDelete={trash.handleHardDeleteProduct}
              onPageChange={goToDeletedPage}
            />
          </TabsContent>

          <TabsContent value="api-keys">
            <ApiKeysPanel
              apiKeys={apiKeys.apiKeys}
              newProvider={apiKeys.newProvider}
              onNewProviderChange={apiKeys.setNewProvider}
              addingKey={apiKeys.addingKey}
              reorderingKeys={apiKeys.reorderingKeys}
              onAddApiKey={apiKeys.handleAddApiKey}
              onDeleteKey={apiKeys.handleDeleteKey}
              onResetKey={apiKeys.handleResetKey}
              onKeyDragStart={apiKeys.handleKeyDragStart}
              onKeyDragOver={apiKeys.handleKeyDragOver}
              onKeyDrop={apiKeys.handleKeyDrop}
              onKeyDragEnd={apiKeys.handleKeyDragEnd}
            />
          </TabsContent>
        </Tabs>
      </main>
    </TooltipProvider>
  );
}
