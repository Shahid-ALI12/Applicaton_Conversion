export interface StockRow {
    product_id: number;
    product_name: string;
    location_id: number;
    location_name: string;
    stock_quantity: number;
    last_bag_weight_kg: number | null;
}
export declare function getStockBalance(productId?: number, locationId?: number): StockRow[];
export declare function decrementStock(productId: number, locationId: number, qty: number, bagWeightKg?: number | null): void;
export declare function incrementStock(productId: number, locationId: number, qty: number, bagWeightKg?: number | null): void;
