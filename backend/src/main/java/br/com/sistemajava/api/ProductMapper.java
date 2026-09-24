package br.com.sistemajava.api;

import br.com.sistemajava.domain.Product;
import org.mapstruct.*;

@Mapper(componentModel = "spring")
public interface ProductMapper {
  @Mapping(target = "categoryId", source = "category.id")
  @Mapping(target = "categoryName", source = "category.name")
  Dtos.ProductView toView(Product product);
}
