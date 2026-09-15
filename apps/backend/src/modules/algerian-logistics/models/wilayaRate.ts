import { model } from "@medusajs/framework/utils"

const WilayaRate = model.define("wilaya_rate", {
    // pins the "wilaya_ prefix to every generated id"
  id: model.id({ prefix: "wrate"}).primaryKey(),
  wilaya_code: model.number().unique().index(), // code 1 to 69
  wilaya_name_fr: model.text(),
  wilaya_name_ar: model.text(),
  wilaya_name_en: model.text(),

  // Financial metrics stored securely in cents (e.g., 40000 cents = 400.00 DZD)
  desk_price: model.bigNumber().default(0),
  home_price: model.bigNumber().default(0),
    // Tracing identifier linking directly back to Medusa's Multi-Region framework parameters
  region_id: model.text().index(),  
  delivery_center_id: model.text().nullable(),
  is_active: model.boolean().default(true),
    overrides: model.hasMany(() => CommuneOverride), 

})

export const CommuneOverride = model.define("commune_override", {
  id: model.id({ prefix: "com_override" }).primaryKey(),
  commune_name_fr: model.text(),                  // Must exactly match geoalgeria string
  home_delivery_price: model.bigNumber(),         // Overridden home price for this specific commune
  stop_desk_price: model.bigNumber(),             // Overridden desk price (if applicable)
  is_active: model.boolean().default(true),
  wilaya_rate: model.belongsTo(() => WilayaRate, { mappedBy: "overrides" }),
})

export default WilayaRate;