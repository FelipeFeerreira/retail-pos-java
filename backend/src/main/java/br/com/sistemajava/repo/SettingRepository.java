package br.com.sistemajava.repo;

import br.com.sistemajava.domain.Setting;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SettingRepository extends JpaRepository<Setting, String> {}
