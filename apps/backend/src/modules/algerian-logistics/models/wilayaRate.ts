import { model } from "@medusajs/framework/utils"

const WilayaRate = model.define("wilaya_rate", {
    // pins the "wilaya_ prefix to every generated id"
  id: model.id({ prefix: "wrate"}).primaryKey(),
  wilaya_code: model.number().unique().index(), // code 1 to 69
  // Financial metrics stored securely in cents (e.g., 40000 cents = 400.00 DZD)
  desk_price: model.bigNumber().default(0),
  home_price: model.bigNumber().default(0),
    // Tracing identifier linking directly back to Medusa's Multi-Region framework parameters
  region_id: model.text().index(),  

})

export default WilayaRate;