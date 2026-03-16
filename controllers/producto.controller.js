import db from "../config/db.js";

// Obtener todos los productos
export const getProductos = async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM producto");
    
    // Mapear los nombres de columnas para el frontend
    const productosMapeados = rows.map(producto => ({
      id_producto: producto.id_producto,
      nombre: producto.nombre,
      descripcion: producto.descripcion,
      precio: producto.precio,
      stock: producto.stock,
       stock_minimo: producto.stock_minimo, // 👈 NUEVO
      categoriaId: producto.id_categoria ,  // ← Cambiado de categoriaId a categoria_id
      marcaId: producto.id_marca,          // ← Cambiado de marcaId a marca_id  
      paisOrigenId: producto.id_pais_origen // ← Cambiado de paisOrigenId a pais_origen_id
    }));
    
    console.log('Productos mapeados:', productosMapeados); // Para debug
    res.json(productosMapeados);
  } catch (error) {
    console.error("Error al obtener productos:", error);
    res.status(500).json({ message: "Error al obtener productos" });
  }
};

// Obtener producto por ID
export const getProductoById = async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM producto WHERE id_producto = ?", [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: "Producto no encontrado" });
    
    const producto = rows[0];
    // Mapear nombres de columnas
    const productoMapeado = {
      id_producto: producto.id_producto,
      nombre: producto.nombre,
      descripcion: producto.descripcion,
      precio: producto.precio,
      stock: producto.stock,
      stock_minimo: producto.stock_minimo, // 👈 NUEVO
      categoriaId: producto.id_categoria ,
      marcaId: producto.id_marca,
      paisOrigenId: producto.id_pais_origen
    };
    
    res.json(productoMapeado);
  } catch (error) {
    console.error("Error al obtener producto:", error);
    res.status(500).json({ message: "Error al obtener producto" });
  }
};

// Agregar producto nuevo
export const createProducto = async (req, res) => {
  try {
    // ✅ Eliminamos proveedorId del destructuring
    const { 
      nombre, 
      descripcion, 
      precio, 
      categoriaId, 
      marcaId, 
      paisOrigenId,
      stockMinimo, // 👈 NUEVO
      presentacion,
      volumen 
    } = req.body;
    
    const stock = 0; // Siempre 0 al crear

    const [result] = await db.query(
      `INSERT INTO producto 
       (nombre, descripcion, precio, stock,stock_minimo, id_categoria, id_marca, id_pais_origen, presentacion, volumen) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [nombre, descripcion, precio, stock,stockMinimo || 0, categoriaId, marcaId, paisOrigenId, presentacion, volumen]
    );
    
    res.status(201).json({ 
      id: result.insertId, 
      message: "Producto creado correctamente" 
    });
  } catch (error) {
    console.error("Error al crear producto:", error);
    res.status(500).json({ message: "Error al crear producto" });
  }
};

// Actualizar producto
export const updateProducto = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, descripcion, precio, stock, stockMinimo, categoriaId, marcaId,  paisOrigenId } = req.body;

    const [result] = await db.query(
      "UPDATE producto SET nombre = ?, descripcion = ?, precio = ?, stock = ?, stock_minimo = ?,id_categoria= ?, id_marca= ?, id_proveedor  = ?, id_pais_origen = ? WHERE id_producto = ?",
      [nombre, descripcion, precio, stock,stockMinimo || 0, categoriaId, marcaId, paisOrigenId, id]
    );

    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Producto no encontrado" });

    res.json({ message: "Producto actualizado correctamente" });
  } catch (error) {
    console.error("Error al actualizar producto:", error);
    res.status(500).json({ message: "Error al actualizar producto" });
  }
};

// Eliminar producto
export const deleteProducto = async (req, res) => {
  try {
    const [result] = await db.query("DELETE FROM producto WHERE id_producto = ?", [req.params.id]);
    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Producto no encontrado" });

    res.json({ message: "Producto eliminado correctamente" });
  } catch (error) {
    console.error("Error al eliminar producto:", error);
    res.status(500).json({ message: "Error al eliminar producto" });
  }
};